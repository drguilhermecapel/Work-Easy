import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN_ID, CLIENT_ID, manyPayments, PROVIDER_ID } from './fake';

vi.mock('../../lib/supabase', async () => {
  const { createAdminFake, current } = await import('./fake');
  return { supabase: createAdminFake(() => current.world), backendEnabled: true };
});

const { fake, renderAdmin, resetWorld } = await import('./harness');
const { approvalCheck, auditProviderId, explainAdminError, periodBounds, groupMetrics, missingSteps, registryLookupUrl, stepStatuses, PAGE_SIZE } =
  await import('../../services/admin');

// The status filter also has an <option> with each label: count only the badges of the rows
const statusBadges = (label = 'Recebido') => screen.queryAllByText(label, { selector: 'span' });

const filtersOf = (table: string) => fake.tableCalls.filter(call => call.table === table).at(-1)?.filters ?? [];

describe('painel', () => {
  beforeEach(() => {
    resetWorld();
  });

  it('shows the counts per entity and status, with week, month and total', async () => {
    renderAdmin('/admin');
    const requests = (await screen.findByRole('table', { name: 'Pedidos por situação' })) as HTMLElement;
    const open = within(requests).getByRole('row', { name: /Aberto/ });
    expect(within(open).getAllByRole('cell').map(c => c.textContent)).toEqual(['2', '5', '9']);
    const sum = within(requests).getByRole('row', { name: /Soma/ });
    expect(within(sum).getAllByRole('cell').map(c => c.textContent)).toEqual(['3', '8', '13']);
    expect(within(screen.getByRole('table', { name: 'Atendimentos por situação' })).getByText('Em contestação')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Prestadores por situação' })).getByText('Em análise')).toBeInTheDocument();
    expect(screen.getAllByText('Nada registrado ainda.')).toHaveLength(2); // payments and proposals have no rows
  });

  it('links the pending work: queue and disputes', async () => {
    renderAdmin('/admin');
    const queue = await screen.findByRole('link', { name: /Prestadores na fila/ });
    expect(queue).toHaveAttribute('href', '/admin/prestadores');
    await waitFor(() => expect(within(queue).getByText('1')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Disputas abertas/ })).toHaveAttribute('href', '/admin/disputas');
  });

  it('does not break when a view cannot be read', async () => {
    const world = resetWorld();
    world.errors.admin_metrics = { code: '42501', message: 'permission denied' };
    renderAdmin('/admin');
    expect(await screen.findByRole('alert')).toHaveTextContent('Você não tem permissão');
    expect(screen.getByRole('heading', { name: 'Painel' })).toBeInTheDocument();
  });

  it('groups metrics by entity and ignores unknown ones', () => {
    const grouped = groupMetrics([{ entity: 'bookings', status: 'paid', this_week: 0, this_month: 1, total: 2 }]);
    expect(grouped.bookings).toHaveLength(1);
    expect(grouped.requests).toEqual([]);
  });
});

describe('pagamentos', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    resetWorld();
  });

  it('lists payments with status, money in reais, fee and provider; never asks for the gateway payload', async () => {
    const world = (await import('./fake')).current.world;
    world.tables.payments = manyPayments(2, { platform_fee_cents: 1200 });
    renderAdmin('/admin/pagamentos');
    expect(await screen.findByText('R$ 100,00')).toBeInTheDocument();
    expect(statusBadges()).toHaveLength(2);
    expect(screen.getAllByText('R$ 12,00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Dr. Paulo Cardio').length).toBeGreaterThan(0);
    // The name leads to the provider
    expect(screen.getAllByRole('link', { name: 'Dr. Paulo Cardio' })[0]).toHaveAttribute('href', `/admin/prestadores/${PROVIDER_ID}`);
    const columns = fake.tableCalls.find(call => call.table === 'payments')?.columns ?? '';
    expect(columns).not.toMatch(/\braw\b|\*/);
  });

  it('filters by status and by period in São Paulo time', async () => {
    const world = (await import('./fake')).current.world;
    world.tables.payments = [
      ...manyPayments(1, { id: 'pay-a', status: 'received', amount_cents: 1111, created_at: '2026-10-10T12:00:00Z' }),
      ...manyPayments(1, { id: 'pay-b', status: 'refunded', amount_cents: 2222, created_at: '2026-10-11T12:00:00Z' }),
      ...manyPayments(1, { id: 'pay-c', status: 'refunded', amount_cents: 3333, created_at: '2026-10-20T12:00:00Z' }),
    ];
    renderAdmin('/admin/pagamentos');
    expect(await screen.findByText('R$ 11,11')).toBeInTheDocument();
    expect(screen.getByText('R$ 22,22')).toBeInTheDocument();
    expect(screen.getByText('R$ 33,33')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Situação'), 'refunded');
    await user.type(screen.getByLabelText('De'), '2026-10-11');
    await user.type(screen.getByLabelText('Até'), '2026-10-15');
    await user.click(screen.getByRole('button', { name: 'Filtrar' }));

    expect(await screen.findByText('R$ 22,22')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('R$ 11,11')).not.toBeInTheDocument());
    expect(screen.queryByText('R$ 33,33')).not.toBeInTheDocument();
    const filters = filtersOf('payments');
    expect(filters).toContainEqual(['eq', 'status', 'refunded']);
    // 11/10 00:00 and 16/10 00:00 in São Paulo (UTC-3)
    expect(filters).toContainEqual(['gte', 'created_at', '2026-10-11T03:00:00.000Z']);
    expect(filters).toContainEqual(['lt', 'created_at', '2026-10-16T03:00:00.000Z']);

    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(await screen.findByText('R$ 33,33')).toBeInTheDocument();
  });

  it('reads one page at a time and pages forward and back', async () => {
    const world = (await import('./fake')).current.world;
    world.tables.payments = manyPayments(PAGE_SIZE + 5);
    renderAdmin('/admin/pagamentos');
    await screen.findByRole('navigation', { name: 'Paginação' });
    expect(screen.getByText('Página 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    expect(statusBadges()).toHaveLength(PAGE_SIZE);
    // One extra row is requested to know whether there is a next page
    expect(fake.ranges.at(-1)).toEqual({ table: 'payments', from: 0, to: PAGE_SIZE });

    await user.click(screen.getByRole('button', { name: 'Próxima página' }));
    await screen.findByText('Página 2');
    expect(fake.ranges.at(-1)).toEqual({ table: 'payments', from: PAGE_SIZE, to: PAGE_SIZE * 2 });
    expect(screen.getByRole('button', { name: 'Próxima página' })).toBeDisabled();
    expect(statusBadges()).toHaveLength(5);

    await user.click(screen.getByRole('button', { name: 'Página anterior' }));
    await screen.findByText('Página 1');
    expect(statusBadges()).toHaveLength(PAGE_SIZE);
  });

  it('refuses an inverted period before reading', async () => {
    renderAdmin('/admin/pagamentos');
    await screen.findByRole('heading', { name: 'Pagamentos' });
    await user.type(screen.getByLabelText('De'), '2026-10-20');
    await user.type(screen.getByLabelText('Até'), '2026-10-10');
    await user.click(screen.getByRole('button', { name: 'Filtrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A data inicial não pode ser depois da data final.');
  });

  it('computes the São Paulo bounds of a period', () => {
    expect(periodBounds('2026-10-11', '2026-10-11')).toEqual({ start: '2026-10-11T03:00:00.000Z', end: '2026-10-12T03:00:00.000Z' });
    expect(periodBounds()).toEqual({ start: null, end: null });
    expect(() => periodBounds('2026-02-31')).toThrow();
  });
});

describe('auditoria', () => {
  const user = userEvent.setup();

  const auditRows = (count: number, overrides: Record<string, unknown> = {}) =>
    Array.from({ length: count }, (_, i) => ({
      id: 1000 - i,
      actor_id: ADMIN_ID,
      action: 'provider.status',
      entity: 'provider',
      entity_id: PROVIDER_ID,
      data: { from: 'pending_review', to: 'approved', reason: `Motivo ${i}` },
      at: new Date(Date.UTC(2026, 9, 10, 12) - i * 60_000).toISOString(),
      ...overrides,
    }));

  beforeEach(() => {
    resetWorld();
  });

  it('shows who did what, the reason and the data of each entry', async () => {
    const world = (await import('./fake')).current.world;
    world.tables.audit_log = [...auditRows(1), { ...auditRows(1)[0], id: 5, actor_id: null, action: 'payment.received', entity: 'payment', entity_id: 'p1', data: { via: 'service' } }];
    renderAdmin('/admin/auditoria');
    expect(await screen.findByText('provider.status')).toBeInTheDocument();
    expect(screen.getByText('Ana Administradora (a0000000)')).toBeInTheDocument();
    expect(screen.getByText('Motivo 0')).toBeInTheDocument();
    expect(screen.getByText('Sistema')).toBeInTheDocument();
    expect(screen.getAllByText('Dados da ação')).toHaveLength(2);
  });

  it('links the entries about a provider (also the ones about one of its occupations) to its page', async () => {
    const world = (await import('./fake')).current.world;
    world.tables.audit_log = [
      ...auditRows(1),
      { ...auditRows(1)[0], id: 6, action: 'occupation.approval', entity: 'provider_occupation', entity_id: `${PROVIDER_ID}:cardiologista` },
      { ...auditRows(1)[0], id: 7, action: 'payment.received', entity: 'payment', entity_id: 'p1' },
    ];
    renderAdmin('/admin/auditoria');
    await screen.findByText('occupation.approval');
    const links = screen.getAllByRole('link', { name: 'Abrir o prestador desta ação' });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute('href', `/admin/prestadores/${PROVIDER_ID}`);
  });

  it('has no way to change or delete an entry', async () => {
    const world = (await import('./fake')).current.world;
    world.tables.audit_log = auditRows(2);
    renderAdmin('/admin/auditoria');
    await screen.findAllByText('provider.status');
    expect(screen.queryByRole('button', { name: /excluir|apagar|editar/i })).not.toBeInTheDocument();
    expect(fake.tableCalls.every(call => call.op === 'select')).toBe(true);
  });

  it('filters by entity and by actor', async () => {
    const world = (await import('./fake')).current.world;
    world.tables.audit_log = [...auditRows(2), ...auditRows(1, { id: 7, entity: 'payment', action: 'payment.raw_viewed', actor_id: CLIENT_ID })];
    renderAdmin('/admin/auditoria');
    await screen.findAllByText('provider.status');

    await user.type(screen.getByLabelText('Entidade'), 'payment');
    await user.click(screen.getByRole('button', { name: 'Filtrar' }));
    expect(await screen.findByText('payment.raw_viewed')).toBeInTheDocument();
    expect(screen.queryByText('provider.status')).not.toBeInTheDocument();
    expect(filtersOf('audit_log')).toContainEqual(['eq', 'entity', 'payment']);

    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    await screen.findAllByText('provider.status');
    await user.type(screen.getByLabelText(/Ator/), ADMIN_ID);
    await user.click(screen.getByRole('button', { name: 'Filtrar' }));
    await waitFor(() => expect(screen.queryByText('payment.raw_viewed')).not.toBeInTheDocument());
    expect(filtersOf('audit_log')).toContainEqual(['eq', 'actor_id', ADMIN_ID]);
  });

  it('asks for a full identifier when the actor is not one', async () => {
    renderAdmin('/admin/auditoria');
    await screen.findByRole('heading', { name: 'Auditoria' });
    await user.type(screen.getByLabelText(/Ator/), 'Ana');
    await user.click(screen.getByRole('button', { name: 'Filtrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('identificador (UUID)');
  });

  it('pages through the log', async () => {
    const world = (await import('./fake')).current.world;
    world.tables.audit_log = auditRows(PAGE_SIZE + 3);
    renderAdmin('/admin/auditoria');
    await screen.findByText('Página 1');
    expect(screen.getAllByText('provider.status')).toHaveLength(PAGE_SIZE);
    await user.click(screen.getByRole('button', { name: 'Próxima página' }));
    await screen.findByText('Página 2');
    expect(screen.getAllByText('provider.status')).toHaveLength(3);
    expect(fake.ranges.at(-1)).toEqual({ table: 'audit_log', from: PAGE_SIZE, to: PAGE_SIZE * 2 });
  });
});

describe('solicitações LGPD', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    resetWorld();
  });

  it('lists the requests and filters by status', async () => {
    const world = (await import('./fake')).current.world;
    world.tables.data_requests = [
      { id: 'r1', user_id: CLIENT_ID, kind: 'export', status: 'completed', completed_at: '2026-10-05T12:00:00Z', result_path: 'x/y.json', created_at: '2026-10-05T11:00:00Z' },
      { id: 'r2', user_id: null, kind: 'delete', status: 'failed', completed_at: null, result_path: null, created_at: '2026-10-06T11:00:00Z' },
    ];
    renderAdmin('/admin/lgpd');
    expect(await screen.findByText('Cópia dos dados')).toBeInTheDocument();
    expect(screen.getByText('Cris Cliente (c0000000)')).toBeInTheDocument();
    expect(screen.getByText('Arquivo gerado')).toBeInTheDocument();
    expect(screen.getByText('Conta já anonimizada')).toBeInTheDocument();
    expect(screen.getByText(/Este pedido não terminou/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Situação'), 'failed');
    await waitFor(() => expect(screen.queryByText('Cópia dos dados')).not.toBeInTheDocument());
    expect(screen.getByText('Exclusão da conta')).toBeInTheDocument();
  });

  it('says when there are no requests', async () => {
    renderAdmin('/admin/lgpd');
    expect(await screen.findByText('Nenhuma solicitação encontrada.')).toBeInTheDocument();
  });
});

describe('regras de revisão de prestador', () => {
  it('finds the policy steps without an accepted document', () => {
    const policy = { verification: ['documento_selfie', 'cnh'] } as never;
    expect(missingSteps(policy, [{ step: 'documento_selfie', status: 'accepted' }, { step: 'cnh', status: 'submitted' }])).toEqual(['cnh']);
    expect(missingSteps(null, [])).toEqual([]);
  });

  it('builds the council lookup only for occupations with a registry, without sending the number or the state', () => {
    expect(registryLookupUrl({ registry_name: '', regulator_body: '' })).toBeNull();
    expect(registryLookupUrl(null)).toBeNull();
    const url = registryLookupUrl({ registry_name: 'OAB', regulator_body: 'OAB' });
    expect(url).toMatch(/^https:\/\//);
    expect(decodeURIComponent(url ?? '')).toContain('consulta pública OAB OAB');
  });

  it('gives each step of the policy its state: an accepted document wins over a sent one, a sent one over a rejected one', () => {
    const policy = { verification: ['documento_selfie', 'cadastro_fiscal', 'cnh', 'seguro_rc'] } as never;
    const doc = (step: string, status: string) => ({ id: `${step}${status}`, step, status }) as never;
    const states = stepStatuses(policy, [
      doc('documento_selfie', 'rejected'),
      doc('documento_selfie', 'accepted'),
      doc('cadastro_fiscal', 'rejected'),
      doc('cadastro_fiscal', 'submitted'),
      doc('cnh', 'rejected'),
    ]);
    expect(states.map(item => [item.step, item.state])).toEqual([
      ['documento_selfie', 'accepted'],
      ['cadastro_fiscal', 'submitted'],
      ['cnh', 'rejected'],
      ['seguro_rc', 'missing'],
    ]);
    expect(stepStatuses(null, [])).toEqual([]);
  });

  it('allows approving an occupation only with every step accepted and a registry that was not rejected', () => {
    const policy = { verification: ['documento_selfie', 'cnh'] } as never;
    const accepted = [
      { step: 'documento_selfie', status: 'accepted' },
      { step: 'cnh', status: 'accepted' },
    ] as never[];
    expect(approvalCheck({ registry_status: 'informed', policy }, accepted)).toEqual({ ok: true, reason: null });
    expect(approvalCheck({ registry_status: 'informed', policy }, accepted.slice(0, 1))).toMatchObject({
      ok: false,
      reason: 'Falta documento aceito para: CNH na categoria adequada.',
    });
    expect(approvalCheck({ registry_status: 'rejected', policy }, accepted)).toMatchObject({ ok: false });
    // No policy: nothing says which documents are required, so it is a block, not a free pass
    expect(approvalCheck({ registry_status: 'not_required', policy: null }, [])).toEqual({
      ok: false,
      reason: 'Esta ocupação não tem política no catálogo, então não há como saber quais documentos exigir.',
    });
    expect(approvalCheck({ registry_status: 'not_required', policy: { verification: [] } as never }, [])).toEqual({ ok: true, reason: null });
  });

  it('explains the refusals of the database for the administration and leaves the other errors alone', () => {
    const refusal = (message: string, details: string | null) => ({ code: 'P0001', message, details });
    expect(explainAdminError(refusal('documents_missing', 'cnh,seguro_rc')).message).toBe(
      'O banco recusou a aprovação: falta documento aceito para CNH na categoria adequada; Seguro de responsabilidade civil.',
    );
    expect(explainAdminError(refusal('documents_missing', null)).message).toMatch(/faltam documentos aceitos exigidos pela política/);
    expect(explainAdminError(refusal('not_allowed', 'policy missing')).message).toMatch(/não tem política no catálogo/);
    expect(explainAdminError(refusal('not_allowed', 'registry rejected')).message).toMatch(/registro profissional desta ocupação está rejeitado/);
    expect(explainAdminError(refusal('not_allowed', 'file missing')).message).toMatch(/não está no armazenamento/);
    expect(explainAdminError(refusal('not_allowed', null)).message).toBe('Você não tem permissão para fazer isso.');
    expect(explainAdminError({ code: '42501', message: 'permission denied' }).message).toBe('Você não tem permissão para acessar ou alterar estes dados.');
  });

  it('finds the provider an audit entry is about', () => {
    expect(auditProviderId('provider', PROVIDER_ID)).toBe(PROVIDER_ID);
    expect(auditProviderId('provider_occupation', `${PROVIDER_ID}:cardiologista`)).toBe(PROVIDER_ID);
    expect(auditProviderId('provider_document', PROVIDER_ID)).toBeNull();
    expect(auditProviderId('provider', 'not-an-id')).toBeNull();
    expect(auditProviderId('provider', null)).toBeNull();
  });
});
