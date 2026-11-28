import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectAccessibleScreen } from './contract';

// The accessibility contract of the ride screens (O17 PAR-501..508). Every service is the real one:
// only the transport is replaced, by a fake that answers each database function by name with the
// shape the migrations return. A screen reader depends on what this checks: names, labels, ids and
// the order of the headings. Contrast and target size are measured in a browser, not here.

const world = vi.hoisted(() => ({
  signedIn: true,
  mode: 'backend',
  answers: {} as Record<string, unknown>,
  calls: [] as [name: string, args: Record<string, unknown> | undefined][],
}));
vi.mock('../../lib/supabase', () => ({ backendEnabled: true, supabase: null }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    mode: world.mode,
    loading: false,
    isAuthenticated: world.signedIn,
    isAdmin: true,
    authUser: world.signedIn ? { id: 'pessoa' } : null,
  }),
}));
vi.mock('../../services/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/client')>()),
  db: () => ({
    rpc: async (name: string, args?: Record<string, unknown>) => {
      world.calls.push([name, args]);
      const answer = world.answers[name];
      return { data: typeof answer === 'function' ? answer(args) : (answer ?? null), error: null };
    },
  }),
}));

const { default: Corridas } = await import('../../pages/mobilidade/Corridas');
const { default: Grupos } = await import('../../pages/mobilidade/Grupos');
const { default: Empresa } = await import('../../pages/mobilidade/Empresa');
const { default: Frota } = await import('../../pages/mobilidade/Frota');
const { default: Convite } = await import('../../pages/mobilidade/Convite');
const { default: RideParties } = await import('../../pages/admin/RideParties');
const { default: Modalidades } = await import('../../pages/mobilidade/Modalidades');
const { default: RideModes } = await import('../../pages/admin/RideModes');
const { default: QuoteForm } = await import('../../pages/mobilidade/QuoteForm');
const { default: HourlyBlock } = await import('../../components/mobility/modes/HourlyBlock');
const { default: Intercity } = await import('../../components/mobility/modes/Intercity');
const { RideDisplayMode } = await import('../../components/mobility/safety/common');

const TOKEN = 'ab'.repeat(32);
const called = (name: string) => world.calls.filter(([call]) => call === name);
const open = (path: string, route: string, page: React.ReactElement) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={page} />
      </Routes>
    </MemoryRouter>,
  );

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
  reviews: [{ driver_id: 'd1a2b3c4-0000-4000-8000-000000000001', vehicle: 'sedan', status: 'approved', valid_until: '2090-01-01' }],
  offers: [],
};
const family = {
  id: 'grupo',
  kind: 'family',
  name: 'Família Teste',
  role: 'admin',
  owner: true,
  verified: true,
  verified_until: null,
  default_method: 'pix',
  monthly_limit_cents: 30000,
  committed_cents: 4000,
  member_limit_cents: null,
  group_tag: null,
  mandate_id: null,
  members: [
    { member_id: 'pessoa', name: 'Ana', role: 'admin', status: 'active', member_limit_cents: null, group_tag: null },
    { member_id: 'bia', name: 'Bia', role: 'member', status: 'active', member_limit_cents: 5000, group_tag: null },
  ],
  invites: [{ id: 'convite', role: 'member', expires_at: '2090-12-01T14:00:00Z', status: 'pending' }],
  dependents: [
    {
      id: 'dep',
      account_id: 'grupo',
      label: 'Teca',
      age_band: '16-17',
      legal_basis: 'parental_authority',
      status: 'verified',
      valid_until: '2090-06-30',
      legs: [{ leg_id: 'trecho', status: 'requested', pickup_at: '2090-12-01T15:00:00Z' }],
    },
  ],
};
const memberOfFamily = { ...family, role: 'member', owner: false, monthly_limit_cents: null, committed_cents: null, member_limit_cents: 5000, mandate_id: 'mandato', members: [], invites: [], dependents: undefined };
const noCompanions = { companions: [], mandates: [], invites: [] };
const leg = {
  id: 'trecho',
  seq: 1,
  origin: 'Saúde',
  destination: 'Jabaquara',
  payer: 'family',
  pickup_at: '2090-12-01T15:00:00Z',
  status: 'requested',
  driver_id: null,
  can_cancel: true,
  fare_cents: null,
  fee_cents: null,
  driver_cents: null,
  extras_cents: null,
  limit_cents: null,
  funding: { kind: 'payer', mandate_kind: 'family', role: 'rider', account_id: 'grupo', account_name: 'Família Teste' },
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  world.signedIn = true;
  world.mode = 'backend';
  world.calls = [];
  world.answers = {
    ride_dashboard: dashboard,
    ride_my_accounts: [],
    ride_my_companions: noCompanions,
    ride_my_rider_invites: [],
    // What the other panels of a ride page read, answered empty so the screen is the one a person sees
    ride_route_cases: [],
    ride_passenger_updates: { external_available: false, forward: false, items: [] },
    ride_amendment_state: { status: 'requested', can_propose: false, can_reschedule: false, anchor: null, origin_area: 'Saúde', destination_area: 'Jabaquara', current_cents: null, changes: [] },
  };
});

describe('Corridas in the simplified mode keeps the accessibility contract', () => {
  beforeEach(() => localStorage.setItem('ride-simple', 'on'));

  it('asks for a quote paid by the family group, from the first field to the confirmation', async () => {
    world.answers.ride_my_accounts = [memberOfFamily];
    world.answers.ride_quote_sponsored = { id: 'cotacao', expires_at: '2090-12-01T14:00:00Z', total_cents: null, legs: [] };
    open('/corridas', '/corridas', <Corridas />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Corridas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modo simplificado ativado' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement).toHaveClass('ride-simple');
    const who = await screen.findByRole('group', { name: 'Quem viaja e quem paga' });
    expectAccessibleScreen();

    fireEvent.click(within(who).getByLabelText(/o grupo familiar Família Teste paga · seu limite mensal é R\$\s50,00/));
    fireEvent.change(screen.getByLabelText('Ponto de origem'), { target: { value: 'Saúde' } });
    fireEvent.change(screen.getByLabelText('Ponto de destino'), { target: { value: 'Jabaquara' } });
    expectAccessibleScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar preço' }));
    expect(await screen.findByText('Cotação registrada. Confira os trechos e os pagadores abaixo.')).toBeInTheDocument();
    expect(called('ride_quote_sponsored')).toHaveLength(1);
    expect(called('ride_quote_sponsored')[0][1]).toMatchObject({
      p_mandate: 'mandato',
      p_scheduled_at: null,
      p_legs: [{ origin: 'Saúde', destination: 'Jabaquara', payer: 'passenger' }],
    });
    expect(called('ride_quote')).toHaveLength(0);
    expectAccessibleScreen();
  });

  it('cancels a requested leg after the confirmation that says what the cancellation costs', async () => {
    world.answers.ride_dashboard = {
      ...dashboard,
      rides: [{ id: 'viagem', passenger_id: 'pessoa', in_my_journeys: true, kind: 'standalone', status: 'requested', scheduled_at: null, booking_id: null, legs: [leg] }],
    };
    world.answers.ride_my_accounts = [family];
    world.answers.ride_transition = { status: 'cancelled' };
    open('/corridas', '/corridas', <Corridas />);
    expect(await screen.findByRole('heading', { level: 3, name: 'Corrida avulsa' })).toBeInTheDocument();
    expect(screen.getByText('Saúde → Jabaquara')).toBeInTheDocument();
    expect(screen.getByText(/Quem paga: o grupo familiar Família Teste\./)).toBeInTheDocument();
    // The leg carries a dependent: the guardian's watch is offered on the leg itself
    expect(await screen.findByRole('button', { name: 'Acompanhar a viagem de Teca' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('navigation', { name: 'Quem viaja e quem paga' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Família, acompanhante e dependentes' })).toHaveAttribute('href', '/corridas/grupos');
    expect(screen.getByRole('link', { name: 'Empresa' })).toHaveAttribute('href', '/corridas/empresa');
    expect(screen.getByRole('link', { name: 'Frota' })).toHaveAttribute('href', '/corridas/frota');
    expect(screen.queryByRole('alert')).toBeNull();
    expectAccessibleScreen();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar trecho' }));
    expect(screen.getByText(/A taxa de cancelamento cobrada automaticamente do pagador é/)).toBeInTheDocument();
    expect(called('ride_transition')).toHaveLength(0);
    expectAccessibleScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento do trecho' }));
    await waitFor(() => expect(called('ride_transition')).toHaveLength(1));
    expect(called('ride_transition')[0][1]).toMatchObject({ p_leg: 'trecho', p_to: 'cancelled' });
    expectAccessibleScreen();
  });

  it('turns an own quote by area into an invite for another person', async () => {
    world.answers.ride_dashboard = {
      ...dashboard,
      quotes: [
        {
          id: 'cotacao',
          booking_id: null,
          expires_at: '2090-12-01T14:00:00Z',
          total_cents: 3250,
          status: 'awaiting_consent',
          accepted_by_me: false,
          required_from_me: true,
          legs: [{ ...leg, id: undefined, payer: 'passenger', funding: undefined, fare_cents: 3250, extras_cents: 0, limit_cents: 3250 }],
        },
      ],
    };
    world.answers.ride_invite_rider = { id: 'convite-1', token: TOKEN, expires_at: '2090-12-01T13:30:00Z' };
    open('/corridas', '/corridas', <Corridas />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pedir para outra pessoa' }));
    fireEvent.change(screen.getByLabelText('E-mail de quem vai viajar'), { target: { value: 'ana@exemplo.test' } });
    expectAccessibleScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Gerar convite de viagem' }));
    expect(((await screen.findByLabelText('Link do convite')) as HTMLInputElement).value).toContain('/corridas/convite#viagem=' + TOKEN);
    expect(called('ride_invite_rider')[0][1]).toMatchObject({ p_quote: 'cotacao', p_email: 'ana@exemplo.test', p_minutes: 30 });
    expectAccessibleScreen();
  });
});

describe('the pages of groups, companies and fleets keep the accessibility contract', () => {
  it('/corridas/grupos: family, companion, dependent and sent invites', async () => {
    world.answers.ride_my_accounts = [family];
    world.answers.ride_my_companions = {
      companions: [
        { owner_id: 'pessoa', companion_id: 'caio', label: 'Caio', mine: true, notices: ['arriving'], pays: true, since: '2090-01-01T00:00:00Z' },
        { owner_id: 'lia', companion_id: 'pessoa', label: 'Dona Lia', mine: false, notices: ['boarded'], pays: false, since: '2090-01-01T00:00:00Z' },
      ],
      mandates: [],
      invites: [{ id: 'c1', status: 'pending', notices: ['arriving'], pays: false, expires_at: '2090-12-01T14:00:00Z' }],
    };
    world.answers.ride_my_rider_invites = [
      { id: 'i1', status: 'pending', ceiling_cents: 3000, scheduled_at: null, expires_at: '2090-12-01T14:00:00Z', answered_at: null, created_at: '2090-12-01T13:00:00Z', ride_id: null },
    ];
    open('/corridas/grupos', '/corridas/grupos', <Grupos />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Grupos e pessoas de confiança' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: 'Grupo familiar' }, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: 'Acompanhante de confiança' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: 'Adolescente com responsável' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 3, name: 'Convites de viagem enviados' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Acompanhar a viagem de Teca' })).toBeInTheDocument();
    expectAccessibleScreen();
  });

  it('/corridas/empresa: every panel of an administrator', async () => {
    world.answers.ride_my_accounts = [
      {
        ...family,
        id: 'org',
        kind: 'organization',
        name: 'Ateliê Fictício Ltda.',
        verified_until: '2090-06-30T15:00:00Z',
        dependents: undefined,
        cost_centers: [{ id: 'cc1', code: 'CC-1', label: 'Comercial', active: true }],
        programs: [
          {
            id: 'prog',
            label: 'Visitas',
            enabled: true,
            budget_cents: 100000,
            committed_cents: 25000,
            ride_value_cents: 4000,
            member_limit_cents: null,
            areas: ['Saúde'],
            classes: [],
            group_tag: null,
            valid_from: '2026-11-01T03:00:00Z',
            valid_until: '2090-11-01T03:00:00Z',
            excess_payer: 'rider',
            requires_approval: true,
          },
        ],
        grants: [
          { id: 'g1', program_id: 'prog', cost_center_id: 'cc1', beneficiary: 'Bia', purpose: 'Feira', status: 'requested', valid_from: '2090-12-01T12:00:00Z', valid_until: '2090-12-02T12:00:00Z', guest: false, mine: false },
        ],
      },
    ];
    world.answers.ride_org_report = {
      account_id: 'org',
      month: '2026-11-01',
      rows: [{ date: '2026-11-03', cost_center: 'CC-1', cost_center_label: 'Comercial', member: 'Bia', ride_class: null, voucher_cents: 3000, refunded_cents: 0, reserved_cents: 0 }],
      by_cost_center: [{ cost_center: 'CC-1', cost_center_label: 'Comercial', voucher_cents: 3000, refunded_cents: 0, net_cents: 3000 }],
      voucher_cents: 3000,
      refunded_cents: 0,
      reserved_cents: 0,
      invoice: null,
    };
    open('/corridas/empresa', '/corridas/empresa', <Empresa />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Empresa' })).toBeInTheDocument();
    for (const name of ['Programas de voucher', 'Pedidos aguardando decisão', 'Central de viagens para convidados', 'Pessoas e papéis', 'Centros de custo', 'Relatório mensal'])
      expect(await screen.findByRole('heading', { level: 2, name }, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByRole('columnheader', { name: 'Reservado' })).toBeInTheDocument();
    expectAccessibleScreen();
  });

  it('/corridas/frota: vehicles, a cession in review, people and the month, and the card of a driver', async () => {
    const fleet = {
      ...family,
      id: 'frota',
      kind: 'fleet',
      name: 'Locadora Fictícia',
      verified_until: '2090-06-30T15:00:00Z',
      dependents: undefined,
      members: [
        { member_id: 'pessoa', name: 'Ana', role: 'admin', status: 'active', member_limit_cents: null, group_tag: null },
        { member_id: 'm2', name: 'Bruno', role: 'fleet_driver', status: 'active', member_limit_cents: null, group_tag: null },
      ],
      invites: [{ id: 'c0', role: 'fleet_driver', expires_at: '2090-01-01T15:00:00Z', status: 'pending' }],
    };
    world.answers.ride_my_accounts = [fleet];
    world.answers.ride_fleet_overview = {
      account_id: 'frota',
      month: '2026-11-01',
      vehicles: [
        { id: 'v1', vehicle_identifier: 'ABC1D23', category: 'sedan', document_ref: 'DOC-1', insurance_ref: 'APOLICE-9', inspection_ref: 'VISTORIA-3', vehicle_until: '2090-12-31', insurance_until: '2090-06-30', inspection_until: '2090-03-31', status: 'active', expired: false },
      ],
      assignments: [
        { id: 'cessao', vehicle_id: 'v1', driver_id: 'm2', driver_name: 'Bruno', cession_ref: 'CONTRATO-7', beneficiary: 'fleet', from: '2026-11-01T03:00:00Z', until: '2090-12-01T03:00:00Z', status: 'pending_review' },
      ],
      legs: [{ date: '2026-11-03', status: 'completed', vehicle_id: 'v1', driver_cents: 2400 }],
    };
    const first = open('/corridas/frota', '/corridas/frota', <Frota />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Frota' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 3, name: 'ABC1D23 · Sedã' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Motoristas e gestores' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Resumo do mês' })).toBeInTheDocument();
    expectAccessibleScreen();
    first.unmount();

    world.answers.ride_my_accounts = [{ ...fleet, role: 'fleet_driver', owner: false, members: [], invites: [] }];
    world.answers.ride_my_cessions = [
      { id: 'cessao', account_id: 'frota', account_name: 'Locadora Fictícia', vehicle_identifier: 'ABC1D23', category: 'sedan', cession_ref: 'CONTRATO-7', beneficiary: 'driver', from: '2026-11-01T03:00:00Z', until: '2090-12-01T03:00:00Z', status: 'pending_review', created_at: '2026-10-30T12:00:00Z' },
    ];
    open('/corridas/frota', '/corridas/frota', <Frota />);
    expect(await screen.findByRole('heading', { level: 2, name: 'Você dirige por esta frota' }, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByText('ABC1D23 · Sedã')).toBeInTheDocument();
    expectAccessibleScreen();
  });
});

describe('the invite page keeps the accessibility contract in each of its views', () => {
  const invite = (fragment: string) => open('/corridas/convite#' + fragment, '/corridas/convite', <Convite />);
  const legs = [{ seq: 1, origin: 'Saúde', destination: 'Jabaquara', pickup_at: '2090-12-01T15:00:00Z' }];

  it('#viagem= of a ride someone else pays', async () => {
    world.answers.ride_rider_invite = {
      id: 'i1',
      status: 'pending',
      legs,
      scheduled_at: '2090-12-01T15:00:00Z',
      instructions: 'Espere na portaria.',
      expires_at: '2090-12-01T14:00:00Z',
      simulation: true,
      support: { channel: 'email', address: 'plantao@exemplo.test', team: 'Plantão de ensaio', on_duty: false },
    };
    invite('viagem=' + TOKEN);
    expect(await screen.findByRole('heading', { level: 1, name: 'Convite de viagem' }, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Aceitar e pedir a viagem' })).toBeInTheDocument();
    expect(called('ride_rider_invite')[0][1]).toEqual({ p_token: TOKEN });
    expect(called('ride_guest_invite')).toHaveLength(0);
    expectAccessibleScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Recusar convite' }));
    expectAccessibleScreen();
  });

  it('#viagem= of a company guest trip, read when the token is not a ride invite', async () => {
    world.answers.ride_guest_invite = { id: 'g1', status: 'pending', account_name: 'Ateliê Fictício Ltda.', legs, scheduled_at: null, expires_at: '2090-12-01T14:00:00Z', simulation: true };
    invite('viagem=' + TOKEN);
    expect(await screen.findByRole('heading', { level: 1, name: 'Viagem a convite de uma empresa' }, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Aceitar viagem' })).toBeInTheDocument();
    expect(called('ride_guest_invite')[0][1]).toEqual({ p_token: TOKEN });
    // Reading never answers: the invite is consumed only by the person's own click
    expect(called('ride_answer_guest_invite')).toHaveLength(0);
    expect(called('ride_answer_rider_invite')).toHaveLength(0);
    expectAccessibleScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Recusar convite' }));
    expectAccessibleScreen();
  });

  it('#adesao= of a family, company or fleet account', async () => {
    world.answers.ride_account_invite = { id: 'a1', account_name: 'Locadora Fictícia', kind: 'fleet', role: 'fleet_driver', expires_at: '2090-12-01T14:00:00Z', simulation: true };
    invite('adesao=' + TOKEN);
    expect(await screen.findByRole('heading', { level: 1, name: 'Convite de uma frota' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/convidou você como motorista da frota/)).toBeInTheDocument();
    expect(called('ride_companion_invite')).toHaveLength(0);
    expectAccessibleScreen();
  });

  it('#adesao= of a companion invite that asks to pay', async () => {
    world.answers.ride_companion_invite = { id: 'c1', owner_label: 'Dona Lia', notices: ['arriving', 'completed'], pays: true, ceiling_cents: 15000, expires_at: '2090-12-01T14:00:00Z', simulation: true };
    invite('adesao=' + TOKEN);
    expect(await screen.findByRole('heading', { level: 1, name: 'Convite para acompanhar uma pessoa' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aceitar e pagar as corridas' })).toBeInTheDocument();
    expect(called('ride_join_account')).toHaveLength(0);
    expect(called('ride_answer_companion')).toHaveLength(0);
    expectAccessibleScreen();
  });

  it('#convite= of a trip shared with a trusted contact', async () => {
    world.answers.ride_shared_progress = { status: 'boarded', eta: '2090-12-01T15:30:00Z', approximate_position: null, expires_at: '2090-12-01T16:00:00Z', simulation: true };
    invite('convite=' + TOKEN);
    expect(await screen.findByRole('heading', { level: 1, name: 'Viagem compartilhada' })).toBeInTheDocument();
    expect(await screen.findByText(/Convite válido até/)).toBeInTheDocument();
    expect(called('ride_rider_invite')).toHaveLength(0);
    expect(called('ride_account_invite')).toHaveLength(0);
    expectAccessibleScreen();
  });

  it('a signed-out visitor keeps the invite, whatever its kind, for after the sign-in', async () => {
    world.signedIn = false;
    invite('adesao=' + TOKEN);
    expect(screen.getByRole('heading', { level: 1, name: 'Convite de corridas' })).toBeInTheDocument();
    expectAccessibleScreen();
    fireEvent.click(screen.getByRole('link', { name: 'Entrar para consultar' }));
    expect(JSON.parse(sessionStorage.getItem('ride-invite-session') ?? 'null')).toMatchObject({ kind: 'adesao', token: TOKEN });
    expect(world.calls).toHaveLength(0);
  });
});

describe('the operator console of ride accounts keeps the accessibility contract', () => {
  it('/admin/corridas/contas: every queue with its rows, the programs and the other actions', async () => {
    world.answers.admin_ride_party_queue = {
      accounts: [{ id: 'org-nova', kind: 'organization', name: 'Ateliê Fictício', state: 'pending', verified_until: null, created_at: '2026-11-20T12:00:00Z' }],
      dependents: [{ id: 'dep', label: 'Teca', age_band: '16-17', requested_at: '2026-11-25T12:00:00Z' }],
      cessions: [{ id: 'cessao', fleet_name: 'Locadora Fictícia', vehicle_identifier: 'ABC1D23', driver_label: 'Bruno', from: '2026-12-01T03:00:00Z', until: '2027-06-01T03:00:00Z' }],
      disputes: [{ id: 'disputa', account_name: 'Ateliê Fictício', month: '2026-10-01', kind: 'voucher', cents: 3000, reason: 'Valor em duplicidade', raised_at: '2026-11-05T12:00:00Z' }],
      invoices: [{ account_id: 'org-antiga', account_name: 'Gráfica Fictícia', months: ['2026-09-01'] }],
    };
    world.answers.admin_ride_organizations = [
      {
        id: 'org-antiga',
        name: 'Gráfica Fictícia',
        verified: true,
        verified_until: '2090-05-30T15:00:00Z',
        created_at: '2026-01-05T12:00:00Z',
        programs: [
          { id: 'prog', label: 'Visitas', enabled: true, budget_cents: 100000, committed_cents: 25000, ride_value_cents: 4000, member_limit_cents: null, areas: ['Saúde'], classes: [], group_tag: null, valid_from: '2026-11-01T03:00:00Z', valid_until: '2090-11-01T03:00:00Z', excess_payer: 'rider', requires_approval: false, funding_ref: 'CONTRATO-12', evidence_ref: 'DOSSIE-12', created_at: '2026-10-20T12:00:00Z' },
        ],
      },
    ];
    render(<RideParties />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Contas de corridas' })).toBeInTheDocument();
    for (const name of ['Contas para conferir (1)', 'Dependentes para revisar (1)', 'Cessões de frota para revisar (1)', 'Faturas para fechar (1)', 'Contestações de fatura (1)'])
      expect(await screen.findByRole('heading', { level: 2, name })).toBeInTheDocument();
    const programs = await screen.findByRole('region', { name: 'Programas de voucher das empresas' }, { timeout: 5000 });
    fireEvent.click(await within(programs).findByRole('button', { name: 'Alterar Visitas' }));
    fireEvent.click(within(programs).getByRole('button', { name: 'Registrar programa para Gráfica Fictícia' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Outras ações' })).toBeInTheDocument();
    expectAccessibleScreen();
  });
});

// O17 stage 6: the modalities. Answers follow the jsonb the migrations 20261127110601..110609 return.
const modality = (code: string, label: string, over: Record<string, unknown> = {}) => ({
  code,
  par: 'PAR-604',
  label,
  operational: true,
  flow: code,
  status: 'pilot',
  available: true,
  reason: null,
  source: 'https://fonte.invalid/' + code,
  consulted_on: '2026-11-27',
  note: null,
  valid_until: '2090-01-01T03:00:00Z',
  open_from: null,
  open_until: null,
  roles: ['passenger'],
  ...over,
});
const marketCatalog = {
  environment: 'simulation',
  market: { code: 'sao-paulo', country: 'BR', city: 'São Paulo' },
  language: 'pt-BR',
  currency: 'BRL',
  minor_unit: 2,
  timezone: 'America/Sao_Paulo',
  at: '2026-11-28T12:00:00Z',
  roles: ['passenger'],
  gates: { module: true, quote: true, dispatch: true, monetization: false },
  vehicles: [{ category: 'minivan', seats: 6 }],
  classes: [{ area: 'Saúde', code: 'economico', label: 'Econômico', surcharge_cents: 0, seats: 4, tools: false, accessible: false, luggage: 1 }],
  methods: [{ method: 'pix', origin: 'Saúde', destination: 'Jabaquara', valid_until: '2090-01-01T03:00:00Z', card_brands: [] }],
  modalities: [
    modality('car', 'Carro', { par: 'O16' }),
    modality('shuttle_seat', 'Assento em linha de van'),
    modality('hourly', 'Por hora', { par: 'PAR-606' }),
    modality('intercity', 'Entre municípios', { par: 'PAR-606', available: false, reason: 'corridor_unavailable' }),
    modality('taxi', 'Táxi', { par: 'PAR-603', operational: false, status: 'inventory', available: false, reason: 'not_authorized', note: 'Somente catálogo.' }),
  ],
};
const shuttleBoard = {
  simulation: true,
  charged: false,
  lines: [
    {
      id: 'linha',
      origin_area: 'Saúde',
      destination_area: 'Aeroporto de ensaio',
      seat_cents: 2500,
      minutes: 40,
      departures: [
        { id: 'partida', departs_at: '2090-12-01T15:00:00Z', seats_total: 12, seats_left: 3, state: 'open' },
        { id: 'partida-2', departs_at: '2090-12-01T17:00:00Z', seats_total: 12, seats_left: 12, state: 'open' },
      ],
    },
  ],
  my_seats: [
    { id: 'assento', line_id: 'linha', departure_id: 'partida', origin_area: 'Saúde', destination_area: 'Aeroporto de ensaio', departs_at: '2090-12-01T15:00:00Z', seats: 1, seat_cents: 2500, state: 'confirmed', replaces: null, booked_at: '2026-11-28T12:00:00Z', closed_at: null, refund_due_cents: 0, notice: null },
  ],
};

describe('the stage 6 modalities keep the accessibility contract', () => {
  beforeEach(() => localStorage.setItem('ride-simple', 'on'));

  it('/corridas/modalidades: the market, the records, the consulted trip and the seat panel opened by the server door', async () => {
    world.answers.ride_market_catalog = marketCatalog;
    world.answers.ride_request_modality = { modality: 'shuttle_seat', par: 'PAR-604', flow: 'shuttle_seat', environment: 'simulation', market: 'sao-paulo', status: 'pilot', valid_until: null };
    world.answers.ride_shuttle_board = shuttleBoard;
    open('/corridas/modalidades', '/corridas/modalidades', <Modalidades />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Modalidades de corrida' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modo simplificado ativado' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('heading', { level: 2, name: 'Não disponíveis na WorkEasy' })).toBeInTheDocument();
    expect(screen.getByText('Não há corredor entre municípios autorizado para este trajeto e horário.')).toBeInTheDocument();
    expectAccessibleScreen();
    fireEvent.change(await screen.findByLabelText('Origem'), { target: { value: 'Saúde' } });
    fireEvent.change(screen.getByLabelText('Destino'), { target: { value: 'Jabaquara' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar modalidades' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ver partidas e assentos' }));
    expect(await screen.findByRole('heading', { level: 3, name: 'Reservar assento' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Assentos em van de linha' })).toBeInTheDocument();
    expect(called('ride_request_modality')[0][1]).toMatchObject({ p_modality: 'shuttle_seat', p_origin: 'Saúde', p_destination: 'Jabaquara' });
    expectAccessibleScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'Trocar de partida' }));
    expectAccessibleScreen();
  });

  it('the hourly block and the intercity trip, before and after the quote', async () => {
    world.answers.ride_block_options = [{ code: '3h', minutes: 180, included_km: 60, block_cents: 24000, extra_15min_cents: 1500, extra_km_cents: 200 }];
    world.answers.ride_quote_block = {
      id: 'bloco', booking_id: null, expires_at: '2090-12-01T14:00:00Z', scheduled_at: '2090-12-01T15:00:00Z', total_cents: 24000, status: 'awaiting_consent',
      required_from_me: true, accepted_by_me: false,
      legs: [{ seq: 1, origin: 'Saúde', destination: 'Jabaquara', payer: 'passenger', fare_cents: 24000, extras_cents: 0, limit_cents: 24000, block: '3h', block_minutes: 180, block_cents: 24000 }],
    };
    const hourly = render(<MemoryRouter><RideDisplayMode /><HourlyBlock /></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText('Área de embarque'), { target: { value: 'Saúde' } });
    fireEvent.change(screen.getByLabelText('Área do desembarque final'), { target: { value: 'Jabaquara' } });
    fireEvent.change(screen.getByLabelText('Início do bloco (São Paulo)'), { target: { value: '2090-12-01T12:00' } });
    fireEvent.click(await screen.findByRole('radio', { name: /3 horas · 60 km incluídos/ }));
    expectAccessibleScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar preço do bloco' }));
    expect(await screen.findByRole('heading', { level: 3, name: /Bloco de 3 horas/ })).toBeInTheDocument();
    expectAccessibleScreen();
    hourly.unmount();

    world.answers.ride_intercity_options = [
      { origin: 'Saúde', destination: 'Município vizinho (ensaio)', origin_jurisdiction: 'São Paulo', destination_jurisdiction: 'Município vizinho', empty_return_cents: 3000, return_minutes: 40, valid_until: null },
    ];
    render(<MemoryRouter><RideDisplayMode /><Intercity /></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText('Área de origem'), { target: { value: 'Saúde' } });
    fireEvent.change(screen.getByLabelText('Área de destino'), { target: { value: 'Município vizinho (ensaio)' } });
    expect(screen.getByText(/esse retorno custa/)).toBeInTheDocument();
    expectAccessibleScreen();
  });

  it('a scheduled leg in Corridas: the reserve without a confirmed driver, its choices and the hourly block label', async () => {
    world.answers.ride_dashboard = {
      ...dashboard,
      rides: [{ id: 'viagem', passenger_id: 'pessoa', in_my_journeys: true, kind: 'standalone', status: 'requested', scheduled_at: '2090-12-01T15:00:00Z', booking_id: null, legs: [{ ...leg, payer: 'passenger', funding: undefined, fare_cents: 24000, extras_cents: 0, limit_cents: 24000 }] }],
    };
    world.answers.ride_reserve_state = {
      state: 'contingency', confirm_by: '2090-12-01T13:00:00Z', pickup_at: '2090-12-01T15:00:00Z', original_pickup: '2090-12-01T15:00:00Z',
      airport: 'GRU', terminal: 'Terminal 2', flight_ref: 'WE1234', max_shift_minutes: 180, can_shift: false, can_decide: true, shift: null,
    };
    world.answers.ride_block_state = {
      code: '3h', minutes: 180, included_km: 60, extra_15min_cents: 1500, extra_km_cents: 200, extended_minutes: 0, extended_km: 0, extension_cents: 0,
      ends_at: '2090-12-01T18:00:00Z', can_propose: false, extensions: [],
    };
    open('/corridas', '/corridas', <Corridas />);
    const reserve = await screen.findByRole('region', { name: 'Reserva agendada' });
    expect(within(reserve).getByRole('button', { name: 'Continuar buscando motorista' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Bloco por hora' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Modalidades e disponibilidade' })).toHaveAttribute('href', '/corridas/modalidades');
    expectAccessibleScreen();
    fireEvent.click(within(reserve).getByRole('button', { name: 'Remarcar para outro horário' }));
    expect(within(reserve).getByLabelText('Novo horário de embarque (São Paulo)')).toBeInTheDocument();
    expectAccessibleScreen();
  });

  it('assistance in the quote form, in the simplified mode, with and without a compatible vehicle', async () => {
    world.answers.ride_class_options = [];
    world.answers.ride_access_options = {
      options: [
        { assistance: 'boarding', available: true, boarding_minutes: 5, companion: true },
        { assistance: 'folding_equipment', available: false, boarding_minutes: 5, companion: false },
        { assistance: 'wheelchair_vehicle', available: false, boarding_minutes: 0, companion: false },
      ],
      channel: '+55 11 4000-0000',
    };
    render(
      <MemoryRouter>
        <RideDisplayMode />
        <QuoteForm areas={['Saúde', 'Jabaquara']} bookingId={null} routes={[{ id: 'rota-medida-0001', origin_area: 'Saúde', destination_area: 'Jabaquara' }]} onQuoted={() => undefined} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Modo simplificado ativado' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByLabelText('Medição para a ida'), { target: { value: 'rota-medida-0001' } });
    const access = await screen.findByRole('group', { name: 'Assistência no embarque' });
    fireEvent.click(within(access).getByRole('radio', { name: /Ajuda para embarcar/ }));
    expect(within(access).getByRole('checkbox', { name: /Vou com acompanhante/ })).toBeInTheDocument();
    expectAccessibleScreen();
    world.answers.ride_access_options = { options: [{ assistance: 'boarding', available: false, boarding_minutes: 5, companion: false }], channel: '+55 11 4000-0000' };
    fireEvent.change(screen.getByLabelText('Medição para a ida'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Medição para a ida'), { target: { value: 'rota-medida-0001' } });
    expect(await screen.findByText(/Não há veículo compatível para este trajeto e horário\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '+55 11 4000-0000' })).toHaveAttribute('href', 'tel:+551140000000');
    expectAccessibleScreen();
  });

  it('/admin/corridas/modalidades: the van departures and the cancellation with its reason', async () => {
    world.answers.admin_shuttle_departures = {
      simulation: true,
      departures: [{ id: 'partida', origin_area: 'Saúde', destination_area: 'Aeroporto de ensaio', departs_at: '2090-12-01T15:00:00Z', seats_total: 12, seats_confirmed: 2, state: 'open', driver_assigned: false }],
    };
    render(<MemoryRouter><RideModes /></MemoryRouter>);
    expect(await screen.findByRole('heading', { level: 1, name: 'Modalidades de corrida' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar partida' }));
    expect(screen.getByLabelText(/Motivo do cancelamento/)).toBeInTheDocument();
    expectAccessibleScreen();
  });
});
