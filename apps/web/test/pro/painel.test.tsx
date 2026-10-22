import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { baseTables, occupationRow, ok, policyRow, providerRow, signInProvider, type ProFake, type TableCall } from './fake';

vi.mock('../../lib/supabase', async () => {
  const { createProFake } = await import('./fake');
  return { supabase: createProFake(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { renderPro } = await import('./render');
const fake = supabase as unknown as ProFake;

const inValues = (call: TableCall): string[] => (call.filters.find(([op]) => op === 'in')?.[2] as string[] | undefined) ?? [];

// Thursday 22/10/2026, 12:00 in São Paulo. Only Date is faked, so timers keep working.
const NOW = new Date('2026-10-22T15:00:00Z');

const booking = (id: string, startIso: string, endIso: string, overrides: Record<string, unknown> = {}) => ({
  id,
  client_id: null,
  provider_client_id: 'cli-1',
  occupation_slug: 'diarista',
  period: `[${startIso},${endIso})`,
  price_cents: 15000,
  status: 'accepted',
  origin: 'own',
  platform_fee_cents: 0,
  notes: null,
  canceled_reason: null,
  created_at: '2026-10-01T12:00:00Z',
  ...overrides,
});

const OPEN_REQUEST = {
  id: 'req-1',
  occupation_slug: 'diarista',
  neighborhood_id: 'nb-lapa',
  neighborhood_name: 'Lapa',
  description: 'Faxina de apartamento de 2 quartos',
  preferred_dates: null,
  urgent: false,
  expires_at: '2026-10-29T12:00:00Z',
  created_at: '2026-10-21T12:00:00Z',
  proposal_count: 1,
  my_proposal_id: null,
  my_proposal_status: null,
};

const setup = (provider: ReturnType<typeof providerRow> | null, extra: Record<string, (call: TableCall) => ReturnType<typeof ok>> = {}) => {
  fake.tables = {
    ...baseTables({ provider }),
    occupation_policies: (call: TableCall) =>
      ok([policyRow('diarista', { verification: ['documento_selfie', 'cadastro_fiscal'], labor_lock: true })].filter(row => inValues(call).includes(row.occupation_slug))),
    provider_occupations: () => ok([occupationRow('diarista')]),
    provider_neighborhoods: () => ok([{ neighborhood_id: 'nb-lapa' }]),
    provider_documents: () => ok([]),
    services: () => ok([{ id: 's1', active: true }]),
    availability: () => ok([{ id: 'a1', weekday: 1, start_time: '09:00:00', end_time: '18:00:00' }]),
    provider_clients: () => ok([{ id: 'cli-1', name: 'Carlos Dias' }]),
    bookings: () =>
      ok([
        booking('b-today', '2026-10-22T13:00:00Z', '2026-10-22T15:00:00Z'),
        booking('b-fri', '2026-10-23T13:00:00Z', '2026-10-23T15:00:00Z', { status: 'requested' }),
        booking('b-next-week', '2026-10-26T13:00:00Z', '2026-10-26T15:00:00Z'),
        booking('b-earlier', '2026-10-21T13:00:00Z', '2026-10-21T15:00:00Z'),
        booking('b-canceled', '2026-10-22T17:00:00Z', '2026-10-22T18:00:00Z', { status: 'canceled' }),
      ]),
    ...extra,
  };
  fake.rpcs.open_requests_for_me = () => ok([OPEN_REQUEST, { ...OPEN_REQUEST, id: 'req-2', my_proposal_id: 'p-1', my_proposal_status: 'sent' }]);
};

beforeEach(() => {
  fake.reset();
  signInProvider(fake);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('/pro (panel)', () => {
  it('sends a visitor to /entrar and back', async () => {
    fake.session = null;
    setup(null);
    renderPro('/pro');
    expect(await screen.findByTestId('where')).toHaveTextContent('/entrar?next=%2Fpro');
  });

  it('invites a user who is not a provider yet to start the registration', async () => {
    setup(null);
    renderPro('/pro');
    expect(await screen.findByRole('heading', { name: /Você ainda não é profissional/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Começar o cadastro' })).toHaveAttribute('href', '/pro/cadastro');
    expect(screen.queryByRole('navigation', { name: 'Ferramentas do profissional' })).not.toBeInTheDocument();
  });

  it('shows today, the rest of the week, open requests and the plan of an approved provider', async () => {
    setup(providerRow({ status: 'approved', plan: 'pro' }));
    renderPro('/pro');

    expect(await screen.findByRole('heading', { name: 'Seu cadastro' })).toBeInTheDocument();
    expect(screen.getByText('Aprovado', { selector: 'span.inline-block' })).toBeInTheDocument();
    expect(screen.getByText('Plano Pro')).toBeInTheDocument();

    const today = (await screen.findByRole('heading', { name: 'Hoje' })).closest('section') as HTMLElement;
    expect(within(today).getByText('22/10/2026, 10:00 às 12:00')).toBeInTheDocument();
    expect(within(today).getByText(/Carlos Dias · Diarista · R\$\s150,00/)).toBeInTheDocument();
    expect(within(today).queryByText(/17:00|14:00/)).not.toBeInTheDocument(); // the canceled one

    const week = screen.getByRole('heading', { name: 'Nos próximos dias da semana' }).closest('section') as HTMLElement;
    expect(within(week).getByText('23/10/2026, 10:00 às 12:00')).toBeInTheDocument();
    expect(within(week).getByText('Solicitado')).toBeInTheDocument();
    expect(within(week).queryByText(/26\/10|21\/10/)).not.toBeInTheDocument();

    // One of the two requests already has a proposal from this provider
    expect(screen.getByText(/1 pedido espera a sua proposta/)).toBeInTheDocument();
    expect(screen.getByText('Nada pendente.')).toBeInTheDocument();
  });

  it('lists what is pending in the registration and does not ask for requests before the approval', async () => {
    setup(providerRow({ status: 'draft' }), { provider_neighborhoods: () => ok([]), services: () => ok([]), availability: () => ok([]) });
    renderPro('/pro');

    expect(await screen.findByText('Rascunho', { selector: 'span.inline-block' })).toBeInTheDocument();
    expect(screen.getByText('Plano grátis')).toBeInTheDocument();
    const pending = (await screen.findByRole('heading', { name: /Pendências do cadastro/ })).closest('section') as HTMLElement;
    expect(within(pending).getByText(/Envie os documentos: Documento com foto e selfie; CPF ou CNPJ/)).toBeInTheDocument();
    expect(within(pending).getByText(/Escolha os bairros em que você atende/)).toBeInTheDocument();
    expect(within(pending).getByText(/Cadastre ao menos um serviço/)).toBeInTheDocument();
    expect(within(pending).getByText(/Defina os dias e horários/)).toBeInTheDocument();
    expect(screen.getByText(/Os pedidos aparecem aqui depois que o seu cadastro for aprovado/)).toBeInTheDocument();
    expect(fake.rpcCalls.filter(call => call.name === 'open_requests_for_me')).toEqual([]);
  });

  it('shows the navigation between the Pro screens, scrollable on a phone', async () => {
    setup(providerRow());
    renderPro('/pro');
    const nav = await screen.findByRole('navigation', { name: 'Ferramentas do profissional' });
    expect(nav).toHaveClass('overflow-x-auto');
    const links = within(nav).getAllByRole('link').map(link => link.getAttribute('href'));
    expect(links).toEqual(['/pro', '/pro/cadastro', '/pro/servicos', '/pro/agenda', '/pro/pedidos', '/pro/orcamentos', '/pro/clientes', '/pro/cobrancas', '/pro/assinatura']);
    expect(within(nav).getByRole('link', { name: 'Painel' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the rest of the panel when one read fails and says so', async () => {
    setup(providerRow(), { services: () => ({ data: null, error: { code: '42501', message: 'rls' } }) });
    renderPro('/pro');
    expect(await screen.findByRole('alert')).toHaveTextContent('Você não tem permissão');
    expect(screen.getByRole('heading', { name: 'Hoje' })).toBeInTheDocument();
  });
});
