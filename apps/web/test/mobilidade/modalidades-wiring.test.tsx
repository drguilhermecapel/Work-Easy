import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Suspense } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DATABASE_ERROR_CODES, ERROR_MESSAGES, toAppError } from '../../lib/errors';

// How stage 6 (modalities) is wired into the pages that already existed: the routes, the admin
// menu, the quote form, the ride page and the driver page. The services are the real ones; only the
// transport is replaced by a fake that answers each database function by name, with the shapes of
// the migrations 20261127110601..110609.

const world = vi.hoisted(() => ({
  answers: {} as Record<string, unknown>,
  calls: [] as [name: string, args: Record<string, unknown> | undefined][],
}));
vi.mock('../../lib/supabase', () => ({ backendEnabled: true, supabase: null }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ mode: 'backend', loading: false, isAuthenticated: true, isAdmin: true, authUser: { id: 'pessoa' } }),
}));
vi.mock('../../services/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/client')>()),
  db: () => ({
    rpc: async (name: string, args?: Record<string, unknown>) => {
      world.calls.push([name, args]);
      const answer = world.answers[name];
      if (answer instanceof Error) return { data: null, error: { code: 'P0001', message: answer.message } };
      return { data: typeof answer === 'function' ? answer(args) : (answer ?? null), error: null };
    },
  }),
}));

const { clienteRoutes } = await import('../../pages/cliente/routes');
const { adminRoutes } = await import('../../pages/admin/routes');
const { default: Corridas } = await import('../../pages/mobilidade/Corridas');
const { default: QuoteForm } = await import('../../pages/mobilidade/QuoteForm');
const { DRIVER_VEHICLES, VEHICLES, mobilityLabel } = await import('../../pages/mobilidade/driverLabels');
const { PassengerRideUpdates } = await import('../../components/mobility/PassengerRideUpdates');

const called = (name: string) => world.calls.filter(([call]) => call === name);
const dashboard = {
  enabled: true,
  quote_enabled: true,
  dispatch_enabled: true,
  simulation: true,
  areas: ['Saúde', 'Jabaquara'],
  extra_options: [],
  driver: null,
  rides: [] as unknown[],
  quotes: [] as unknown[],
  reviews: [],
  offers: [],
};
const catalog = {
  environment: 'simulation',
  market: { code: 'sao-paulo', country: 'BR', city: 'São Paulo' },
  language: 'pt-BR',
  currency: 'BRL',
  minor_unit: 2,
  timezone: 'America/Sao_Paulo',
  at: '2026-11-28T12:00:00Z',
  roles: ['passenger'],
  gates: { module: true, quote: true, dispatch: true, monetization: false },
  vehicles: [],
  classes: [],
  methods: [],
  modalities: [],
};
const route = { id: 'rota-medida-0001', origin_area: 'Saúde', destination_area: 'Jabaquara' };
const quote = { id: 'cotacao', expires_at: '2090-12-01T14:00:00Z', total_cents: 3000, legs: [] };
const at = (path: string, routes: React.ReactNode) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Suspense fallback={<p>Carregando</p>}>
        <Routes>{routes}</Routes>
      </Suspense>
    </MemoryRouter>,
  );
const fillArea = () => {
  fireEvent.change(screen.getByLabelText('Ponto de origem'), { target: { value: 'Saúde' } });
  fireEvent.change(screen.getByLabelText('Ponto de destino'), { target: { value: 'Jabaquara' } });
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  world.calls = [];
  world.answers = {
    ride_dashboard: dashboard,
    ride_market_catalog: catalog,
    ride_my_accounts: [],
    ride_my_companions: { companions: [], mandates: [], invites: [] },
    ride_my_rider_invites: [],
    ride_route_cases: [],
    ride_class_options: [],
    ride_passenger_updates: { external_available: false, forward: false, items: [] },
    ride_amendment_state: { status: 'requested', can_propose: false, can_reschedule: false, anchor: null, origin_area: null, destination_area: null, current_cents: null, changes: [] },
  };
});

describe('rotas e menus das modalidades', () => {
  it('abre /corridas/modalidades pela tabela de rotas do cliente e lê o catálogo do servidor', async () => {
    at('/corridas/modalidades', clienteRoutes);
    expect(await screen.findByRole('heading', { level: 1, name: 'Modalidades de corrida' })).toBeInTheDocument();
    await waitFor(() => expect(called('ride_market_catalog')).toHaveLength(1));
  });

  it('abre /admin/corridas/modalidades dentro da administração, com o link ao lado das outras corridas', async () => {
    world.answers.admin_shuttle_departures = { simulation: true, departures: [] };
    at('/admin/corridas/modalidades', adminRoutes);
    expect(await screen.findByRole('heading', { level: 1, name: 'Modalidades de corrida' })).toBeInTheDocument();
    const menu = within(screen.getByRole('navigation', { name: 'Administração' }));
    const links = menu.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(links.indexOf('/admin/corridas/modalidades')).toBe(links.indexOf('/admin/corridas/contas') + 1);
    expect(menu.getByRole('link', { name: 'Modalidades de corrida' })).toHaveAttribute('aria-current', 'page');
  });

  it('Corridas leva ao catálogo de modalidades', async () => {
    at('/corridas', <Route path="/corridas" element={<Corridas />} />);
    expect(await screen.findByRole('link', { name: 'Modalidades e disponibilidade' })).toHaveAttribute('href', '/corridas/modalidades');
  });
});

describe('formulário de cotação · assistência pela porta do servidor', () => {
  it('com trajeto medido, mostra a assistência disponível e cota pela porta acessível com o acompanhante', async () => {
    world.answers.ride_access_options = {
      options: [
        { assistance: 'boarding', available: true, boarding_minutes: 5, companion: true },
        { assistance: 'folding_equipment', available: false, boarding_minutes: 5, companion: false },
        { assistance: 'wheelchair_vehicle', available: false, boarding_minutes: 0, companion: false },
      ],
      channel: 'plantao@exemplo.test',
    };
    world.answers.ride_quote_accessible = quote;
    const onQuoted = vi.fn();
    render(<QuoteForm areas={dashboard.areas} bookingId={null} routes={[route]} onQuoted={onQuoted} />);
    fireEvent.change(screen.getByLabelText('Medição para a ida'), { target: { value: route.id } });
    const access = await screen.findByRole('group', { name: 'Assistência no embarque' });
    expect(called('ride_access_options')[0][1]).toEqual({ p_route: route.id, p_departure: null });
    expect(within(access).getByRole('radio', { name: /Veículo adaptado/ })).toBeDisabled();
    fireEvent.click(within(access).getByRole('radio', { name: /Ajuda para embarcar/ }));
    fireEvent.click(within(access).getByRole('checkbox', { name: /Vou com acompanhante/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Consultar preço' }));
    await waitFor(() => expect(onQuoted).toHaveBeenCalledWith('cotacao'));
    expect(called('ride_quote_accessible')[0][1]).toMatchObject({
      p_booking: null,
      p_assistance: 'boarding',
      p_companion: true,
      p_legs: [{ origin: 'Saúde', destination: 'Jabaquara', payer: 'passenger', route_id: route.id }],
    });
    expect(called('ride_quote_with_access')).toHaveLength(0);
    expect(called('ride_quote')).toHaveLength(0);
  });

  it('sem veículo compatível, diz isso, mostra o canal do plantão e não cria cotação nem promessa', async () => {
    world.answers.ride_access_options = {
      options: [{ assistance: 'boarding', available: true, boarding_minutes: 5, companion: false }],
      channel: '+55 11 4000-0000',
    };
    world.answers.ride_quote_accessible = new Error('ride_assistance_unavailable');
    const onQuoted = vi.fn();
    render(<QuoteForm areas={dashboard.areas} bookingId={null} routes={[route]} onQuoted={onQuoted} />);
    fireEvent.change(screen.getByLabelText('Medição para a ida'), { target: { value: route.id } });
    fireEvent.click(await screen.findByRole('radio', { name: /Ajuda para embarcar/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Consultar preço' }));
    expect(await screen.findByText(/Não há veículo compatível para este trajeto e horário\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '+55 11 4000-0000' })).toHaveAttribute('href', 'tel:+551140000000');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onQuoted).not.toHaveBeenCalled();
    expect(document.body).not.toHaveTextContent(/garantid|assegurad|reservamos um veículo/i);
  });

  it('por área, a assistência escolhida também vai à porta acessível e a recusa traz a frase simples', async () => {
    world.answers.ride_quote_accessible = new Error('ride_assistance_unavailable');
    render(<QuoteForm areas={dashboard.areas} bookingId={null} onQuoted={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Assistência no transporte/), { target: { value: 'wheelchair_vehicle' } });
    fillArea();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar preço' }));
    expect(await screen.findByText(/Não há veículo e motorista compatíveis com esta assistência neste trajeto e horário\. Nenhuma cotação foi criada\./)).toBeInTheDocument();
    expect(screen.getByText(/fale com o plantão da WorkEasy/)).toBeInTheDocument();
    expect(called('ride_quote_accessible')[0][1]).toMatchObject({ p_assistance: 'wheelchair_vehicle', p_companion: false });
  });

  it('sem assistência, a cotação segue pelo caminho de sempre', async () => {
    world.answers.ride_quote = quote;
    const onQuoted = vi.fn();
    render(<QuoteForm areas={dashboard.areas} bookingId={null} onQuoted={onQuoted} />);
    fillArea();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar preço' }));
    await waitFor(() => expect(onQuoted).toHaveBeenCalledWith('cotacao'));
    expect(called('ride_quote_accessible')).toHaveLength(0);
  });

  it('uma corrida paga por outra pessoa não leva assistência (regra da etapa 5)', async () => {
    world.answers.ride_my_accounts = [
      { id: 'grupo', kind: 'family', name: 'Família Teste', role: 'member', owner: false, verified: true, verified_until: null, default_method: 'pix', monthly_limit_cents: null, committed_cents: null, member_limit_cents: 5000, group_tag: null, mandate_id: 'mandato', members: [], invites: [] },
    ];
    world.answers.ride_quote_sponsored = quote;
    const onQuoted = vi.fn();
    render(<QuoteForm areas={dashboard.areas} bookingId={null} onQuoted={onQuoted} />);
    fireEvent.change(screen.getByLabelText(/Assistência no transporte/), { target: { value: 'boarding' } });
    const who = await screen.findByRole('group', { name: 'Quem viaja e quem paga' });
    fireEvent.click(within(who).getByLabelText(/o grupo familiar Família Teste paga/));
    expect(screen.queryByLabelText(/Assistência no transporte/)).toBeNull();
    fillArea();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar preço' }));
    await waitFor(() => expect(onQuoted).toHaveBeenCalledWith('cotacao'));
    expect(called('ride_quote_accessible')).toHaveLength(0);
  });
});

describe('Corridas · reserva, bloco por hora e entre municípios', () => {
  const leg = {
    id: 'trecho',
    seq: 1,
    origin: 'Saúde',
    destination: 'Jabaquara',
    payer: 'passenger',
    pickup_at: '2090-12-01T15:00:00Z',
    status: 'requested',
    driver_id: null,
    can_cancel: true,
    fare_cents: 3000,
    fee_cents: null,
    driver_cents: null,
    extras_cents: 0,
    limit_cents: 3000,
  };
  const ride = (scheduled: string | null) => ({ id: 'viagem', passenger_id: 'pessoa', in_my_journeys: true, kind: 'standalone', status: 'requested', scheduled_at: scheduled, booking_id: null, legs: [leg] });

  it('um trecho agendado com termos de reserva mostra o prazo de confirmação; um imediato não lê a reserva', async () => {
    world.answers.ride_dashboard = { ...dashboard, rides: [ride('2090-12-01T15:00:00Z')] };
    world.answers.ride_reserve_state = {
      state: 'awaiting_driver', confirm_by: '2090-12-01T13:00:00Z', pickup_at: leg.pickup_at, original_pickup: leg.pickup_at,
      airport: null, terminal: null, flight_ref: null, max_shift_minutes: 120, can_shift: true, can_decide: false, shift: null,
    };
    const first = at('/corridas', <Route path="/corridas" element={<Corridas />} />);
    const reserve = await screen.findByRole('region', { name: 'Reserva agendada' });
    expect(reserve).toHaveTextContent('Um motorista precisa confirmar até 01/12/2090 10:00');
    expect(within(reserve).getByRole('button', { name: 'Mudar o horário da reserva' })).toBeInTheDocument();
    expect(called('ride_reserve_state')[0][1]).toEqual({ p_leg: 'trecho' });
    first.unmount();

    world.calls = [];
    world.answers.ride_dashboard = { ...dashboard, rides: [ride(null)] };
    at('/corridas', <Route path="/corridas" element={<Corridas />} />);
    expect(await screen.findByRole('heading', { level: 3, name: 'Corrida avulsa' })).toBeInTheDocument();
    await waitFor(() => expect(called('ride_block_state')).toHaveLength(1));
    expect(called('ride_reserve_state')).toHaveLength(0);
    // ride_block_state answers null for a leg that is not a block: nothing is drawn for it.
    expect(screen.queryByRole('region', { name: 'Bloco por hora' })).toBeNull();
  });

  it('as cotações dizem quando são por hora ou entre municípios, com o retorno sem passageiro à parte', async () => {
    const base = { booking_id: null, expires_at: '2090-12-01T14:00:00Z', status: 'awaiting_consent', accepted_by_me: false, required_from_me: true };
    world.answers.ride_dashboard = {
      ...dashboard,
      quotes: [
        { ...base, id: 'bloco', total_cents: 24000, legs: [{ ...leg, id: undefined, fare_cents: 24000, limit_cents: 24000, block: '3h', block_minutes: 180, block_cents: 24000 }] },
        { ...base, id: 'municipios', total_cents: 9000, legs: [{ ...leg, id: undefined, destination: 'Município vizinho (ensaio)', fare_cents: 9000, limit_cents: 9000, intercity: true, empty_return_cents: 3000 }] },
      ],
    };
    at('/corridas', <Route path="/corridas" element={<Corridas />} />);
    expect(await screen.findByText('Por hora · bloco de 180 min · excedente só com extensão aceita')).toBeInTheDocument();
    expect(screen.getByText(/^Entre municípios · retorno do motorista sem passageiro R\$\s30,00, incluído no preço$/)).toBeInTheDocument();
  });
});

describe('motorista, rótulos e avisos', () => {
  it('a área do motorista leva à frota e mostra as decisões das modalidades', async () => {
    world.answers.ride_dashboard = { ...dashboard, driver: { status: 'approved', vehicle: 'minivan', valid_until: '2099-12-31', online: false } };
    world.answers.driver_mode_tasks = {
      shifts: [{ id: 'pedido', leg_id: 'trecho', origin: 'Saúde', destination: 'Aeroporto de ensaio', reason: 'flight_delay', old_pickup: '2090-12-01T15:00:00Z', new_pickup: '2090-12-01T16:00:00Z', expires_at: '2090-12-01T14:10:00Z' }],
      extensions: [],
      departures: [],
    };
    world.answers.driver_decide_shift = 'applied';
    const { default: Motorista } = await import('../../pages/mobilidade/Motorista');
    at('/corridas/motorista', <Route path="/corridas/motorista" element={<Motorista />} />);
    expect(await screen.findByRole('link', { name: 'Frota' })).toHaveAttribute('href', '/corridas/frota');
    expect(await screen.findByRole('heading', { level: 2, name: 'Horários, extensões e vans' })).toBeInTheDocument();
    expect(screen.getByText(/Minivan/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar novo horário' }));
    await waitFor(() => expect(called('driver_decide_shift')[0][1]).toEqual({ p_shift: 'pedido', p_accept: true }));
  });

  it('SUV e minivan têm rótulo para o motorista; a frota segue com as três categorias que o servidor aceita', () => {
    expect(mobilityLabel('suv')).toBe('SUV');
    expect(mobilityLabel('minivan')).toBe('Minivan');
    expect(Object.keys(DRIVER_VEHICLES)).toEqual(['compact', 'sedan', 'suv', 'minivan', 'van']);
    expect(Object.keys(VEHICLES)).toEqual(['compact', 'sedan', 'van']);
  });

  it('o aviso de reserva sem motorista confirmado tem frase em português', async () => {
    world.answers.ride_passenger_updates = {
      external_available: false,
      forward: false,
      items: [{ leg_id: 'trecho', seq: 1, event: 'reserve_unconfirmed', created_at: '2090-12-01T13:00:00Z' }],
    };
    render(<PassengerRideUpdates revision={1} />);
    expect(await screen.findByText(/Nenhum motorista confirmou a reserva no prazo\. Abra a reserva para continuar a busca, remarcar ou cancelar\./)).toBeInTheDocument();
    expect(screen.queryByText(/reserve_unconfirmed/)).toBeNull();
  });
});

describe('frases das recusas da etapa 6', () => {
  const codes = [
    'ride_modality_unavailable',
    'ride_assistance_unavailable',
    'ride_reserve_window',
    'ride_terminal_unavailable',
    'ride_seat_unavailable',
    'ride_block_unavailable',
    'ride_extension_unavailable',
    'ride_corridor_unavailable',
    'ride_class_required',
    'ride_capacity_changed',
    'route_measurement_locked',
    'ride_mode_frozen',
    'ride_seat_frozen',
    'driver_unavailable',
  ] as const;

  it.each(codes)('%s vira uma frase em português que diz o que fazer e não mostra o código', (code) => {
    expect(DATABASE_ERROR_CODES).toContain(code);
    const error = toAppError({ code: 'P0001', message: code, details: null, hint: null });
    expect(error.code).toBe(code);
    expect(error.message).toBe(ERROR_MESSAGES[code]);
    expect(error.message).not.toContain(code);
    expect(error.message).not.toMatch(/_/);
    expect(error.message.split(/[.:;] /).length).toBeGreaterThan(1);
    expect(error.message).toMatch(/\b(Escolha|escolha|Atualize|Veja|Mantenha|Cancele|Decida|Peça|proponha|fale)\b/);
  });
});
