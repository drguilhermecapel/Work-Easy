import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';

vi.mock('../../lib/supabase', async () => {
  const { createAdminFake, current } = await import('./fake');
  return { supabase: createAdminFake(() => current.world), backendEnabled: true };
});

const { fake, renderAdmin, resetWorld } = await import('./harness');
const { buildFunnel, getMetrics, groupMetrics, RECEIVED_PAYMENT_STATUSES } = await import('../../services/admin');

type Row = Record<string, unknown>;

/** A row of admin_metrics as the view of migration 20261023200000 returns it. */
const metric = (entity: string, status: string, total: number, extra: Row = {}): Row => ({
  entity,
  status,
  this_week: 0,
  this_month: 0,
  total,
  last_7_days: 0,
  last_30_days: 0,
  amount_cents: null,
  month_amount_cents: null,
  ...extra,
});

/** A small operation: 8 providers, 10 requests (5 with a proposal), some jobs, 3 payments received, 7 Pro subscriptions. */
const OPERATION: Row[] = [
  metric('providers', 'draft', 2),
  metric('providers', 'pending_review', 1),
  metric('providers', 'approved', 4),
  metric('providers', 'suspended', 1),
  metric('requests', 'open', 6, { last_7_days: 3, last_30_days: 5 }),
  metric('requests', 'matched', 2, { last_7_days: 1, last_30_days: 2 }),
  metric('requests', 'canceled', 2, { last_30_days: 1 }),
  metric('requests_with_proposal', 'with_proposal', 5, { last_7_days: 2, last_30_days: 4 }),
  metric('bookings', 'requested', 3, { last_30_days: 2 }),
  metric('bookings', 'paid', 2, { last_30_days: 2 }),
  metric('bookings', 'completed', 1, { last_30_days: 1 }),
  metric('payments', 'received', 2, { this_month: 1, last_30_days: 2, amount_cents: 25000, month_amount_cents: 10000 }),
  metric('payments', 'held', 1, { this_month: 1, amount_cents: 5000, month_amount_cents: 5000 }),
  // Not received yet, or not received at all: they must not count as money in
  metric('payments', 'pending', 3, { amount_cents: 9000, month_amount_cents: 0 }),
  metric('payments', 'confirmed', 1, { amount_cents: 3000, month_amount_cents: 3000 }),
  metric('payments', 'refunded', 1, { amount_cents: 4000, month_amount_cents: 0 }),
  metric('subscriptions', 'trialing', 2),
  metric('subscriptions', 'active', 3),
  metric('subscriptions', 'past_due', 1),
  metric('subscriptions', 'pending', 1),
  metric('free_allowance', 'reached', 4),
];

const setMetrics = async (rows: Row[]) => {
  (await import('./fake')).current.world.tables.admin_metrics = rows;
};

/** Text of the numeric cells of one row of a table (the space Intl puts after "R$" is a plain one here). */
const cells = (table: HTMLElement, label: string | RegExp): string[] =>
  within(within(table).getByRole('row', { name: label }))
    .getAllByRole('cell')
    .map(cell => (cell.textContent ?? '').replace(/\s/g, ' '));

const funnel = async (): Promise<HTMLElement> => {
  const heading = await screen.findByRole('heading', { name: 'Funil de operação' });
  return heading.closest('section') as HTMLElement;
};

describe('funil de operação no painel', () => {
  beforeEach(() => {
    resetWorld();
  });

  it('follows the operation: providers, requests with a proposal, jobs, payments received, free limit and Pro subscribers', async () => {
    await setMetrics(OPERATION);
    renderAdmin('/admin');
    const section = await funnel();

    const providers = within(section).getByRole('table', { name: 'Funil: prestadores por situação' });
    expect(cells(providers, /Rascunho/)).toEqual(['2']);
    expect(cells(providers, /Em análise/)).toEqual(['1']);
    expect(cells(providers, /Aprovado/)).toEqual(['4']);
    expect(cells(providers, /Suspenso/)).toEqual(['1']);

    const requests = within(section).getByRole('table', { name: 'Funil: pedidos e propostas recebidas' });
    expect(within(requests).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Indicador', '7 dias', '30 dias', 'Total']);
    expect(cells(requests, /Pedidos criados/)).toEqual(['4', '8', '10']);
    expect(cells(requests, /Com pelo menos uma proposta/)).toEqual(['2', '4', '5']);
    expect(cells(requests, /Parte com proposta/)).toEqual(['50%', '50%', '50%']);

    const bookings = within(section).getByRole('table', { name: 'Funil: atendimentos por situação' });
    expect(cells(bookings, /Solicitado/)).toEqual(['2', '3']);
    // A job is "Aceito"; the shared label of the metrics ("Aceita") is the one of a proposal
    expect(cells(bookings, /^Aceito/)).toEqual(['0', '0']);
    expect(cells(bookings, /Pago/)).toEqual(['2', '2']);
    expect(cells(bookings, /Concluído/)).toEqual(['1', '1']);
    // A status the database has no row for is a zero, in its place of the funnel
    expect(cells(bookings, /Cancelado/)).toEqual(['0', '0']);

    const payments = within(section).getByRole('table', { name: 'Funil: pagamentos recebidos' });
    expect(within(payments).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Indicador', 'Este mês', 'Total']);
    // received + held count; pending, confirmed and refunded do not
    expect(cells(payments, /Pagamentos/)).toEqual(['2', '3']);
    expect(cells(payments, /Valor pago pelos clientes/)).toEqual(['R$ 150,00', 'R$ 300,00']);

    const subscribers = within(section).getByRole('table', { name: 'Funil: assinaturas Pro por situação' });
    expect(cells(subscribers, /Em teste grátis/)).toEqual(['2']);
    expect(cells(subscribers, /^Ativa/)).toEqual(['3']);
    expect(cells(subscribers, /Pagamento atrasado/)).toEqual(['1']);
    expect(cells(subscribers, /Aguardando o primeiro pagamento/)).toEqual(['1']);
    expect(cells(subscribers, /Cancelada/)).toEqual(['0']);

    const limit = within(section).getByRole('heading', { name: 'No limite do plano gratuito' }).parentElement as HTMLElement;
    expect(limit).toHaveTextContent('4 prestadores no limite');
    expect(within(limit).getByRole('link', { name: 'Ver a configuração do limite' })).toHaveAttribute('href', '/admin/configuracoes');
  });

  it('says that the money is what the clients paid, not the revenue of WorkEasy', async () => {
    await setMetrics(OPERATION);
    renderAdmin('/admin');
    const card = (await screen.findByRole('heading', { name: 'Pagamentos recebidos' })).parentElement as HTMLElement;
    expect(card).toHaveTextContent('não a receita da WorkEasy');
    expect(card).toHaveTextContent('a assinatura Pro não entra nesta conta');
    expect(card).toHaveTextContent('Confirmado (ainda não creditado), Devolvido e os demais ficam de fora');
  });

  it('keeps the tables by status below and does not count the funnel rows in them', async () => {
    await setMetrics(OPERATION);
    renderAdmin('/admin');
    await funnel();
    const requests = screen.getByRole('table', { name: 'Pedidos por situação' });
    // 6 + 2 + 2: the row requests_with_proposal is not a status of the requests
    expect(cells(requests, /Soma/)).toEqual(['0', '0', '10']);
    expect(within(requests).queryByText('with_proposal')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Contagens por situação' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Pagamentos por situação' })).toBeInTheDocument();
    // The funnel rows are not a table of their own
    expect(screen.queryByRole('table', { name: /subscriptions|free_allowance|requests_with_proposal/ })).not.toBeInTheDocument();
  });

  it('reads the view once, and the funnel and the tables come from that one read', async () => {
    await setMetrics(OPERATION);
    renderAdmin('/admin');
    await funnel();
    await screen.findByRole('table', { name: 'Pedidos por situação' });
    expect(fake.tableCalls.filter(call => call.table === 'admin_metrics')).toHaveLength(1);
    const columns = fake.tableCalls.find(call => call.table === 'admin_metrics')?.columns ?? '';
    expect(columns).toBe('entity, status, this_week, this_month, total, last_7_days, last_30_days, amount_cents, month_amount_cents');
  });

  it('says each part has nothing yet, instead of a row of zeros', async () => {
    // Only a draft provider exists: no request, no job, no payment, no subscription
    await setMetrics([metric('providers', 'draft', 1)]);
    renderAdmin('/admin');
    const section = await funnel();
    expect(within(section).getByRole('table', { name: 'Funil: prestadores por situação' })).toBeInTheDocument();
    expect(within(section).getByText('Nenhum pedido criado ainda.')).toBeInTheDocument();
    expect(within(section).getByText('Nenhum atendimento criado ainda.')).toBeInTheDocument();
    expect(within(section).getByText('Nenhum pagamento recebido ainda.')).toBeInTheDocument();
    expect(within(section).getByText('Nenhum prestador chegou ao limite neste mês.')).toBeInTheDocument();
    expect(within(section).getByText('Nenhuma assinatura Pro ainda.')).toBeInTheDocument();
    expect(within(section).queryByRole('table', { name: 'Funil: pedidos e propostas recebidas' })).not.toBeInTheDocument();
    expect(within(section).queryByRole('table', { name: 'Funil: pagamentos recebidos' })).not.toBeInTheDocument();
  });

  it('says there are no providers when only requests exist', async () => {
    await setMetrics([metric('requests', 'open', 2, { last_7_days: 2, last_30_days: 2 })]);
    renderAdmin('/admin');
    const section = await funnel();
    expect(within(section).getByText('Nenhum prestador cadastrado ainda.')).toBeInTheDocument();
    const requests = within(section).getByRole('table', { name: 'Funil: pedidos e propostas recebidas' });
    // Requests exist but none received a proposal: 0%, which is a result
    expect(cells(requests, /Parte com proposta/)).toEqual(['0%', '0%', '0%']);
  });

  it('shows a dash, not 0%, for a period with no request to be a part of', async () => {
    // 5 requests, all older than 30 days
    await setMetrics([metric('requests', 'open', 5), metric('requests_with_proposal', 'with_proposal', 2)]);
    renderAdmin('/admin');
    const requests = within(await funnel()).getByRole('table', { name: 'Funil: pedidos e propostas recebidas' });
    expect(cells(requests, /Pedidos criados/)).toEqual(['0', '0', '5']);
    expect(cells(requests, /Parte com proposta/)).toEqual(['—', '—', '40%']);
  });

  it('does not call money received what is only pending, confirmed or refunded', async () => {
    await setMetrics([
      metric('payments', 'pending', 2, { amount_cents: 9000, month_amount_cents: 9000, this_month: 2 }),
      metric('payments', 'confirmed', 1, { amount_cents: 3000, month_amount_cents: 3000, this_month: 1 }),
      metric('payments', 'refunded', 1, { amount_cents: 4000 }),
    ]);
    renderAdmin('/admin');
    const section = await funnel();
    expect(within(section).getByText('Nenhum pagamento recebido ainda.')).toBeInTheDocument();
    // They are still counted by status in the table below
    expect(within(screen.getByRole('table', { name: 'Pagamentos por situação' })).getByRole('row', { name: /Aguardando/ })).toBeInTheDocument();
  });

  it('says the panel has nothing to count when the view is empty, with no funnel', async () => {
    await setMetrics([]);
    renderAdmin('/admin');
    expect(await screen.findByText('Ainda não há pedidos, atendimentos nem prestadores para contar.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Funil de operação' })).not.toBeInTheDocument();
  });

  it('keeps the panel up, without the funnel, when the view cannot be read', async () => {
    const world = resetWorld();
    world.errors.admin_metrics = { code: '42501', message: 'permission denied' };
    renderAdmin('/admin');
    expect(await screen.findByRole('alert')).toHaveTextContent('Você não tem permissão');
    expect(screen.queryByRole('heading', { name: 'Funil de operação' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Prestadores na fila/ })).toBeInTheDocument();
  });
});

describe('pendências do painel', () => {
  beforeEach(() => {
    resetWorld();
  });

  it('counts the occupations still to approve across the queue, next to the providers in it', async () => {
    const world = (await import('./fake')).current.world;
    world.tables.admin_provider_queue.push({
      ...world.tables.admin_provider_queue[0],
      provider_id: 'b0000000-0000-4000-8000-000000000020',
      display_name: 'Outro Prestador',
      slug: 'outro',
      occupations_to_approve: 2,
    });
    renderAdmin('/admin');
    const queue = await screen.findByRole('link', { name: /Prestadores na fila/ });
    await waitFor(() => expect(within(queue).getByText('2')).toBeInTheDocument());
    const occupations = screen.getByRole('link', { name: /Ocupações a aprovar/ });
    expect(occupations).toHaveAttribute('href', '/admin/prestadores');
    await waitFor(() => expect(within(occupations).getByText('3')).toBeInTheDocument());
    expect(occupations).toHaveTextContent('3 a aprovar');
  });

  it('shows 0 occupations to approve when the queue is empty, and a dash when it cannot be read', async () => {
    const world = (await import('./fake')).current.world;
    world.tables.admin_provider_queue = [];
    const view = renderAdmin('/admin');
    const occupations = await screen.findByRole('link', { name: /Ocupações a aprovar/ });
    await waitFor(() => expect(within(occupations).getByText('0')).toBeInTheDocument());
    view.unmount();

    world.errors.admin_provider_queue = { code: '42501', message: 'permission denied' };
    renderAdmin('/admin');
    const failed = await screen.findByRole('link', { name: /Ocupações a aprovar/ });
    await waitFor(() => expect(within(failed).getByText('—')).toBeInTheDocument());
  });
});

describe('leitura do funil', () => {
  beforeEach(() => {
    resetWorld();
  });

  it('turns the rows of the view into numbers, keeps no value as null and leaves unknown entities out', async () => {
    await setMetrics([
      { entity: 'payments', status: 'received', this_week: '1', this_month: '2', total: '3', last_7_days: '1', last_30_days: '2', amount_cents: '12000', month_amount_cents: 0 },
      { entity: 'requests', status: 'open', this_week: 1, this_month: 2, total: 3 },
      { entity: 'free_allowance', status: 'reached', total: 1 },
      { entity: 'invented', status: 'x', total: 99 },
    ]);
    const rows = await getMetrics();
    expect(rows.map(row => row.entity)).toEqual(['payments', 'requests', 'free_allowance']);
    expect(rows[0]).toEqual({
      entity: 'payments',
      status: 'received',
      this_week: 1,
      this_month: 2,
      total: 3,
      last_7_days: 1,
      last_30_days: 2,
      amount_cents: 12000,
      month_amount_cents: 0,
    });
    // A view without the columns (or a row of another entity) has no amount: null, not 0
    expect(rows[1]).toMatchObject({ last_7_days: 0, last_30_days: 0, amount_cents: null, month_amount_cents: null });
  });

  it('builds the funnel from nothing as all zeros, without breaking on an unknown status', () => {
    const empty = buildFunnel([]);
    expect(empty.providers).toEqual({ draft: 0, pending_review: 0, approved: 0, suspended: 0 });
    expect(empty.requests).toEqual({ last7: 0, last30: 0, total: 0 });
    expect(empty.paymentsReceived).toEqual({ count: 0, cents: 0, monthCount: 0, monthCents: 0 });
    expect(empty.bookings.map(row => row.status)).toEqual(['requested', 'accepted', 'paid', 'in_progress', 'completed', 'released', 'canceled', 'disputed']);
    expect(empty.atFreeLimit).toBe(0);
    expect(buildFunnel([metric('providers', 'a_new_status', 7) as never]).providers).toEqual(empty.providers);
  });

  it('counts as received only the payments whose money came in', () => {
    expect(RECEIVED_PAYMENT_STATUSES).toEqual(['received', 'held', 'released']);
    const funnel = buildFunnel(OPERATION as never[]);
    expect(funnel.paymentsReceived).toEqual({ count: 3, cents: 30000, monthCount: 2, monthCents: 15000 });
    expect(funnel.subscribers).toEqual({ trialing: 2, active: 3, past_due: 1, pending: 1, canceled: 0 });
    expect(funnel.requestsWithProposal).toEqual({ last7: 2, last30: 4, total: 5 });
  });

  it('keeps the funnel rows out of the tables of the panel', () => {
    const grouped = groupMetrics(OPERATION as Array<{ entity: string }>);
    expect(grouped.requests).toHaveLength(3);
    expect(Object.values(grouped).flat().some(row => ['subscriptions', 'free_allowance', 'requests_with_proposal'].includes(row.entity))).toBe(false);
  });
});
