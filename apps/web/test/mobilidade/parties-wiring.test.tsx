import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DATABASE_ERROR_CODES, ERROR_MESSAGES, toAppError } from '../../lib/errors';
import { expectAccessibleScreen } from '../a11y/contract';

// How stage 5 (who rides and who pays) is wired into the pages that already existed: the quote
// form, the ride page and the invite page. The services are the real ones; only the transport is
// replaced by a fake that answers each database function by name.

const world = vi.hoisted(() => ({
  signedIn: true,
  answers: {} as Record<string, unknown>,
  calls: [] as [name: string, args: Record<string, unknown> | undefined][],
}));
vi.mock('../../lib/supabase', () => ({ backendEnabled: true, supabase: null }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ mode: 'backend', loading: false, isAuthenticated: world.signedIn, authUser: world.signedIn ? { id: 'pessoa' } : null }),
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

const { default: Corridas } = await import('../../pages/mobilidade/Corridas');
const { default: Convite } = await import('../../pages/mobilidade/Convite');
const { default: QuoteForm } = await import('../../pages/mobilidade/QuoteForm');

const TOKEN = 'cd'.repeat(32);
const areas = ['Saúde', 'Jabaquara'];
const called = (name: string) => world.calls.filter(([call]) => call === name);
const dashboard = {
  enabled: true,
  quote_enabled: true,
  dispatch_enabled: true,
  simulation: true,
  areas,
  extra_options: [],
  driver: null,
  rides: [] as unknown[],
  quotes: [] as unknown[],
  reviews: [],
  offers: [],
};
const account = {
  id: 'grupo',
  kind: 'family',
  name: 'Família Teste',
  role: 'member',
  owner: false,
  verified: true,
  verified_until: null,
  default_method: 'pix',
  monthly_limit_cents: null,
  committed_cents: null,
  member_limit_cents: 5000,
  group_tag: null,
  mandate_id: 'mandato',
  members: [],
  invites: [],
};
const company = {
  ...account,
  id: 'org',
  kind: 'organization',
  name: 'Ateliê Fictício',
  mandate_id: null,
  cost_centers: [{ id: 'cc1', code: 'CC-1', label: 'Comercial', active: true }],
  programs: [
    { id: 'prog', label: 'Visitas', enabled: true, requires_approval: true, excess_payer: 'rider', ride_value_cents: 4000, group_tag: null, valid_from: '2020-01-01T00:00:00Z', valid_until: '2090-01-01T00:00:00Z' },
  ],
  grants: [],
};
const quoted = { id: 'cotacao', expires_at: '2090-12-01T14:00:00Z', total_cents: null, legs: [] };
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
const ride = (legs: unknown[], passenger = 'pessoa') => ({
  id: 'viagem',
  passenger_id: passenger,
  in_my_journeys: true,
  kind: 'standalone',
  status: 'requested',
  scheduled_at: null,
  booking_id: null,
  legs,
});
const quote = (over: Record<string, unknown> = {}) => ({
  id: 'cotacao',
  booking_id: null,
  expires_at: '2090-12-01T14:00:00Z',
  total_cents: 3000,
  status: 'awaiting_consent',
  accepted_by_me: false,
  required_from_me: true,
  legs: [{ ...leg, id: undefined }],
  ...over,
});
const openRides = () =>
  render(
    <MemoryRouter initialEntries={['/corridas']}>
      <Routes>
        <Route path="/corridas" element={<Corridas />} />
      </Routes>
    </MemoryRouter>,
  );
const fillRoute = () => {
  fireEvent.change(screen.getByLabelText('Ponto de origem'), { target: { value: 'Saúde' } });
  fireEvent.change(screen.getByLabelText('Ponto de destino'), { target: { value: 'Jabaquara' } });
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  world.signedIn = true;
  world.calls = [];
  world.answers = {
    ride_dashboard: dashboard,
    ride_my_accounts: [],
    ride_my_companions: { companions: [], mandates: [], invites: [] },
    ride_my_rider_invites: [],
    ride_route_cases: [],
    ride_passenger_updates: { external_available: false, forward: false, items: [] },
    ride_amendment_state: { status: 'requested', can_propose: false, can_reschedule: false, anchor: null, origin_area: null, destination_area: null, current_cents: null, changes: [] },
  };
});

describe('formulário de cotação · quem viaja e quem paga', () => {
  it('quem só viaja e paga por si não vê a escolha e cota pelo caminho de sempre', async () => {
    world.answers.ride_quote = quoted;
    const onQuoted = vi.fn();
    render(<QuoteForm areas={areas} bookingId={null} onQuoted={onQuoted} />);
    await waitFor(() => expect(called('ride_my_accounts')).toHaveLength(1));
    expect(screen.queryByRole('group', { name: 'Quem viaja e quem paga' })).toBeNull();
    fillRoute();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar preço' }));
    await waitFor(() => expect(onQuoted).toHaveBeenCalledWith('cotacao'));
    expect(called('ride_quote')[0][1]).toMatchObject({ p_booking: null, p_legs: [{ origin: 'Saúde', destination: 'Jabaquara', payer: 'passenger' }] });
    expect(called('ride_quote_sponsored')).toHaveLength(0);
  });

  it('com o perfil do grupo escolhido, cota pela chamada do mandato e repete a chave depois de uma falha', async () => {
    world.answers.ride_my_accounts = [account];
    world.answers.ride_quote_sponsored = new Error('ride_limit_exceeded');
    const onQuoted = vi.fn();
    render(<QuoteForm areas={areas} bookingId={null} onQuoted={onQuoted} />);
    fireEvent.click(await screen.findByLabelText(/o grupo familiar Família Teste paga/));
    // The funded quotes take no assistance request: the form says so instead of dropping it silently
    expect(screen.queryByLabelText(/Assistência no transporte/)).toBeNull();
    expect(screen.getByText(/A assistência no transporte ainda não acompanha corridas pagas por outra pessoa/)).toBeVisible();
    fillRoute();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar preço' }));
    // The refusal reads as a sentence that says what to do next
    expect(await screen.findByRole('alert')).toHaveTextContent(/passa do limite combinado com quem paga/);
    expect(onQuoted).not.toHaveBeenCalled();
    world.answers.ride_quote_sponsored = quoted;
    fireEvent.click(screen.getByRole('button', { name: 'Consultar preço' }));
    await waitFor(() => expect(onQuoted).toHaveBeenCalledWith('cotacao'));
    const calls = called('ride_quote_sponsored');
    expect(calls).toHaveLength(2);
    expect(calls[0][1]).toMatchObject({ p_mandate: 'mandato', p_scheduled_at: null, p_legs: [{ origin: 'Saúde', destination: 'Jabaquara', payer: 'passenger' }] });
    expect(calls[1][1]?.p_key).toBe(calls[0][1]?.p_key);
    expect(called('ride_quote')).toHaveLength(0);
    expect(called('ride_quote_with_access')).toHaveLength(0);
  });

  it('viagem a trabalho que exige autorização não é enviada sem centro de custo e sem autorização aprovada', async () => {
    world.answers.ride_my_accounts = [company];
    world.answers.ride_quote_funded = quoted;
    const onQuoted = vi.fn();
    render(
      <MemoryRouter>
        <QuoteForm areas={areas} bookingId={null} onQuoted={onQuoted} />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByLabelText('Eu viajo a trabalho · Ateliê Fictício · Visitas'));
    fillRoute();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar preço' }));
    expect(await screen.findByText(/Este programa pede uma autorização aprovada/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Pedir autorização em Empresa' })).toHaveAttribute('href', '/corridas/empresa');
    expect(called('ride_quote_funded')).toHaveLength(0);
    expect(called('ride_quote')).toHaveLength(0);
    expect(onQuoted).not.toHaveBeenCalled();
  });

  it('com uma autorização aprovada, cota pelo perfil profissional com programa, centro de custo e autorização', async () => {
    world.answers.ride_my_accounts = [
      { ...company, grants: [{ id: 'aut', program_id: 'prog', cost_center_id: 'cc1', purpose: 'Feira', status: 'approved', valid_until: '2090-12-31T00:00:00Z', mine: true }] },
    ];
    world.answers.ride_quote_funded = { ...quoted, total_cents: 5000 };
    const onQuoted = vi.fn();
    render(
      <MemoryRouter>
        <QuoteForm areas={areas} bookingId={null} onQuoted={onQuoted} />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByLabelText('Eu viajo a trabalho · Ateliê Fictício · Visitas'));
    fireEvent.change(screen.getByLabelText('Autorização aprovada'), { target: { value: 'aut' } });
    fillRoute();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar preço' }));
    await waitFor(() => expect(onQuoted).toHaveBeenCalledWith('cotacao'));
    expect(called('ride_quote_funded')[0][1]).toMatchObject({ p_program: 'prog', p_cost_center: 'cc1', p_grant: 'aut' });
  });

  it('a corrida ligada a um atendimento e a recotação de um trecho não oferecem a escolha', async () => {
    world.answers.ride_my_accounts = [account];
    const first = render(<QuoteForm areas={areas} bookingId="atendimento" onQuoted={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Trajeto do profissional' })).toBeVisible();
    first.unmount();
    render(<QuoteForm areas={areas} bookingId={null} replaces="trecho-cancelado" onQuoted={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Cotar corrida' })).toBeVisible();
    // The choice is neither mounted nor read
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(called('ride_my_accounts')).toHaveLength(0);
    expect(screen.queryByRole('group', { name: 'Quem viaja e quem paga' })).toBeNull();
  });
});

describe('página de corridas · quem viaja e quem paga', () => {
  it('oferece pedir para outra pessoa só na cotação própria, avulsa, por área e sem pagador', async () => {
    world.answers.ride_dashboard = {
      ...dashboard,
      quotes: [
        quote({ id: 'propria' }),
        quote({ id: 'medida', legs: [{ ...leg, id: undefined, route_id: 'rota' }] }),
        quote({ id: 'do-grupo', total_cents: null, legs: [{ ...leg, id: undefined, payer: 'family', fare_cents: null }], funding: { kind: 'payer', mandate_kind: 'family', role: 'rider', account_id: 'grupo', account_name: 'Família Teste' } }),
        quote({ id: 'aceita', accepted_by_me: true }),
      ],
    };
    openRides();
    expect(await screen.findAllByRole('heading', { level: 3, name: /Proposta de transporte/ })).toHaveLength(4);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Pedir para outra pessoa' })).toHaveLength(1));
    // The rider of a ride somebody else pays reads who pays and never the price
    expect(screen.getByRole('heading', { level: 3, name: 'Proposta de transporte · Restrito ao pagador' })).toBeVisible();
    expect(screen.getByText(/Quem paga: o grupo familiar Família Teste\. O preço fica com quem paga/)).toBeVisible();
    expect(screen.getByText(/Pagador: Grupo familiar/)).toBeVisible();
    // The list of sent invites is on the page, so a link issued from a quote card is not lost with the card
    await waitFor(() => expect(called('ride_my_rider_invites').length).toBeGreaterThan(0));
    expectAccessibleScreen();
  });

  it('quem paga a viagem de outra pessoa lê o preço e não o trajeto', async () => {
    world.answers.ride_dashboard = {
      ...dashboard,
      rides: [
        ride(
          [{ ...leg, origin: 'Reservado ao passageiro', destination: 'Reservado ao passageiro', payer: 'sponsor', funding: { kind: 'payer', mandate_kind: 'sponsor', role: 'payer', account_id: null, account_name: null } }],
          'outra-pessoa',
        ),
      ],
    };
    openRides();
    expect(await screen.findByText('Trajeto reservado a quem viaja')).toBeVisible();
    expect(screen.getByText(/Pagador: Quem pediu a viagem · Preço: R\$\s30,00/)).toBeVisible();
    expect(screen.getByText('Você paga esta viagem (quem pediu a viagem). O trajeto fica reservado a quem viaja.')).toBeVisible();
    // Not the passenger: no watch for this leg, and the accounts are read only by the quote form's choice
    await waitFor(() => expect(called('ride_my_accounts')).toHaveLength(1));
    expect(screen.queryByRole('button', { name: /Acompanhar a viagem/ })).toBeNull();
  });

  it('mostra o voucher e a diferença do trecho a trabalho e oferece usar o voucher só depois de concluído', async () => {
    const funding = { kind: 'voucher', mandate_kind: null, role: 'rider', account_id: 'org', account_name: 'Ateliê Fictício', voucher_cents: 2500, excess_cents: 500 };
    world.answers.ride_dashboard = {
      ...dashboard,
      rides: [ride([{ ...leg, id: 'feito', status: 'completed', funding }, { ...leg, id: 'aberto', seq: 2, funding: { ...funding, excess_cents: 0 } }])],
    };
    world.answers.ride_redeem_voucher = { order_id: 'pedido', applied_cents: 2500, remainder_cents: 500 };
    openRides();
    expect(await screen.findByText('Viagem a trabalho pela empresa Ateliê Fictício · voucher de R$ 25,00 · diferença de R$ 5,00 por conta de quem viaja.')).toBeVisible();
    expect(screen.getByText('Viagem a trabalho pela empresa Ateliê Fictício · voucher de R$ 25,00 · sem diferença para quem viaja.')).toBeVisible();
    const buttons = await screen.findAllByRole('button', { name: 'Usar voucher' });
    expect(buttons).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Forma de pagamento da diferença'), { target: { value: 'card' } });
    fireEvent.click(buttons[0]);
    expect(await screen.findByText(/Voucher aplicado: R\$\s25,00\. Diferença a seu cargo: R\$\s5,00/)).toBeVisible();
    expect(called('ride_redeem_voucher')[0][1]).toEqual({ p_leg: 'feito', p_method: 'card' });
    expectAccessibleScreen();
  });

  it('o responsável acompanha no próprio trecho a viagem que leva um dependente, e só essa', async () => {
    world.answers.ride_dashboard = { ...dashboard, rides: [ride([{ ...leg, id: 'com-dependente' }, { ...leg, id: 'sem-dependente', seq: 2 }])] };
    world.answers.ride_my_accounts = [
      {
        ...account,
        role: 'admin',
        owner: true,
        mandate_id: null,
        dependents: [
          { id: 'dep', account_id: 'grupo', label: 'Teca', age_band: '16-17', legal_basis: 'guardianship', status: 'verified', valid_until: '2090-06-30', legs: [{ leg_id: 'com-dependente', status: 'requested', pickup_at: '2090-12-01T15:00:00Z' }] },
        ],
      },
    ];
    world.answers.ride_guardian_watch = { status: 'requested', simulation: true, wellness: null, location: null, alerts: [] };
    openRides();
    const watch = await screen.findAllByRole('button', { name: 'Acompanhar a viagem de Teca' });
    expect(watch).toHaveLength(1);
    fireEvent.click(watch[0]);
    expect(await screen.findByText(/Nenhum alerta de desvio ou de sinal ausente/)).toBeVisible();
    expect(called('ride_guardian_watch')[0][1]).toEqual({ p_leg: 'com-dependente' });
  });

  it('com a cotação desligada, os convites já enviados aparecem sem pular nível de título', async () => {
    world.answers.ride_dashboard = { ...dashboard, quote_enabled: false };
    world.answers.ride_my_rider_invites = [
      { id: 'i1', status: 'pending', ceiling_cents: 3000, scheduled_at: null, expires_at: '2090-12-01T14:00:00Z', answered_at: null, created_at: '2090-12-01T13:00:00Z', ride_id: null },
    ];
    openRides();
    expect(await screen.findByRole('heading', { level: 2, name: 'Convites de viagem enviados' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Consultar preço' })).toBeNull();
    expectAccessibleScreen();
  });

  it('leva às páginas de grupos, empresa e frota sem mudar o menu', async () => {
    openRides();
    const links = within(await screen.findByRole('navigation', { name: 'Quem viaja e quem paga' }));
    expect(links.getByRole('link', { name: 'Família, acompanhante e dependentes' })).toHaveAttribute('href', '/corridas/grupos');
    expect(links.getByRole('link', { name: 'Empresa' })).toHaveAttribute('href', '/corridas/empresa');
    expect(links.getByRole('link', { name: 'Frota' })).toHaveAttribute('href', '/corridas/frota');
    // Nobody rides: nothing about dependents is read
    expect(called('ride_my_accounts').length).toBeLessThanOrEqual(1);
  });
});

describe('página de convite · despacho pelo fragmento', () => {
  const at = (entry: string) =>
    render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/corridas/convite" element={<Convite />} />
        </Routes>
      </MemoryRouter>,
    );

  it('um fragmento desconhecido ou malformado não consulta nenhum convite de viagem ou de adesão', async () => {
    at('/corridas/convite#viagem=' + 'z'.repeat(64));
    expect(await screen.findByRole('heading', { name: 'Viagem compartilhada' })).toBeVisible();
    expect(await screen.findByText(/Convite indisponível para esta conta ou encerrado/)).toBeVisible();
    expect(called('ride_rider_invite')).toHaveLength(0);
    expect(called('ride_guest_invite')).toHaveLength(0);
    expect(called('ride_account_invite')).toHaveLength(0);
  });

  it('#viagem= sem convite de nenhum dos dois tipos para esta conta mostra um só aviso', async () => {
    at('/corridas/convite#viagem=' + TOKEN);
    expect(await screen.findByText(/Convite indisponível para esta conta, encerrado ou expirado/, undefined, { timeout: 5000 })).toBeVisible();
    expect(called('ride_rider_invite')).toHaveLength(1);
    expect(called('ride_guest_invite')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(called('ride_answer_rider_invite')).toHaveLength(0);
    expect(called('ride_answer_guest_invite')).toHaveLength(0);
  });

  it('um link antigo de acompanhante, com o marcador na consulta, abre a mesma leitura do servidor', async () => {
    world.answers.ride_companion_invite = { id: 'c1', owner_label: 'Dona Lia', notices: ['arriving'], pays: false, ceiling_cents: null, expires_at: '2090-12-01T14:00:00Z', simulation: false };
    at('/corridas/convite?tipo=acompanhante#adesao=' + TOKEN);
    expect(await screen.findByRole('heading', { name: 'Convite para acompanhar uma pessoa' }, { timeout: 5000 })).toBeVisible();
    expect(called('ride_account_invite')[0][1]).toEqual({ p_token: TOKEN });
    expect(called('ride_companion_invite')[0][1]).toEqual({ p_token: TOKEN });
  });

  it('depois de entrar, retoma o convite guardado com o tipo certo e apaga o registro', async () => {
    sessionStorage.setItem('ride-invite-session', JSON.stringify({ kind: 'adesao', token: TOKEN, expires: Date.now() + 60_000 }));
    world.answers.ride_account_invite = { id: 'a1', account_name: 'Família Teste', kind: 'family', role: 'member', expires_at: '2090-12-01T14:00:00Z', simulation: false };
    at('/corridas/convite');
    expect(await screen.findByRole('heading', { name: 'Convite para o grupo familiar' }, { timeout: 5000 })).toBeVisible();
    expect(sessionStorage.getItem('ride-invite-session')).toBeNull();
  });

  it('um registro guardado antes dos novos tipos continua sendo uma viagem compartilhada; um vencido é ignorado', async () => {
    sessionStorage.setItem('ride-invite-session', JSON.stringify({ token: TOKEN, expires: Date.now() + 60_000 }));
    world.answers.ride_shared_progress = { status: 'boarded', eta: null, approximate_position: null, expires_at: '2090-12-01T16:00:00Z', simulation: false };
    const first = at('/corridas/convite');
    expect(await screen.findByText(/Convite válido até/)).toBeVisible();
    expect(called('ride_shared_progress')[0][1]).toEqual({ p_token: TOKEN });
    first.unmount();
    world.calls = [];
    world.answers.ride_shared_progress = null;
    sessionStorage.setItem('ride-invite-session', JSON.stringify({ kind: 'viagem', token: TOKEN, expires: Date.now() - 1 }));
    at('/corridas/convite');
    expect(await screen.findByText(/Convite indisponível para esta conta ou encerrado/)).toBeVisible();
    expect(called('ride_rider_invite')).toHaveLength(0);
  });
});

describe('frases de erro da etapa de famílias, empresas e frotas', () => {
  const codes = [
    'ride_invite_unavailable',
    'ride_invite_reprice',
    'ride_limit_exceeded',
    'ride_mandate_revoked',
    'ride_account_role_required',
    'ride_voucher_unavailable',
    'ride_approval_required',
    'ride_invoice_closed',
    'ride_minor_unavailable',
    'ride_fleet_review_required',
    'ride_voucher_pending',
    'ride_dependent_in_trip',
  ] as const;

  it.each(codes)('%s vira uma frase em português que diz o que fazer e não mostra o código', (code) => {
    expect(DATABASE_ERROR_CODES).toContain(code);
    const error = toAppError({ code: 'P0001', message: code, details: null, hint: null });
    expect(error.code).toBe(code);
    expect(error.message).toBe(ERROR_MESSAGES[code]);
    expect(error.message).not.toContain(code);
    expect(error.message).not.toMatch(/_/);
    // Two sentences at least: what happened and what the person can do next
    expect(error.message.split(/[.:] /).length).toBeGreaterThan(1);
    expect(error.message).toMatch(/\b(Peça|Confira|Fale|Atualize|conteste|cote|escolha)\b/);
  });

  it('as recusas genéricas que o banco levanta chegam com a frase que o aplicativo já tem', () => {
    expect(toAppError({ code: 'P0001', message: 'invalid_input' }).message).toBe(ERROR_MESSAGES.invalid_input);
    expect(toAppError({ code: 'P0001', message: 'rate_limited' }).message).toBe(ERROR_MESSAGES.rate_limited);
    expect(toAppError({ code: 'P0001', message: 'not_found' }).code).toBe('not_found');
    // Only the whole message, and only as a rule raised by the database
    expect(toAppError({ code: 'P0001', message: 'invalid_input_syntax for type uuid' }).code).toBe('unknown');
    expect(toAppError({ code: 'XX000', message: 'rate_limited' }).code).toBe('unknown');
  });
});
