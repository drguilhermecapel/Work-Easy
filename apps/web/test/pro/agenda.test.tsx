import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { baseTables, functionError, isEq, occupationRow, ok, policyRow, providerRow, ruleError, signInProvider, type ProFake, type TableCall } from './fake';

vi.mock('../../lib/supabase', async () => {
  const { createProFake } = await import('./fake');
  return { supabase: createProFake(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { renderPro } = await import('./render');
const fake = supabase as unknown as ProFake;

const inValues = (call: TableCall): string[] => (call.filters.find(([op]) => op === 'in')?.[2] as string[] | undefined) ?? [];

let availability: Array<Record<string, unknown>>;
let timeOff: Array<Record<string, unknown>>;
let bookings: Array<Record<string, unknown>>;
let laborLock: boolean;

const booking = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  client_id: null,
  provider_client_id: 'cli-1',
  occupation_slug: 'diarista',
  period: '[2030-01-15T12:00:00Z,2030-01-15T16:00:00Z)',
  price_cents: 15000,
  status: 'accepted',
  origin: 'own',
  platform_fee_cents: 0,
  notes: null,
  canceled_reason: null,
  created_at: '2030-01-01T12:00:00Z',
  ...overrides,
});

const setup = () => {
  fake.tables = {
    ...baseTables({ provider: providerRow() }),
    provider_occupations: () => ok([occupationRow('diarista')]),
    occupation_policies: (call: TableCall) =>
      ok([policyRow('diarista', { labor_lock: laborLock, price_units: ['dia'] })].filter(row => inValues(call).includes(row.occupation_slug))),
    platform_settings: () =>
      ok([
        { key: 'labor_lock_days_per_week', value: 2 },
        { key: 'proposal_limit', value: 3 },
      ]),
    provider_clients: () => ok([{ id: 'cli-1', client_id: null, name: 'Carlos Dias', phone: '+5511987654321', email: null, notes: null, origin: 'own', created_at: '2026-10-01T00:00:00Z' }]),
    availability: (call: TableCall) => {
      if (call.op === 'insert') {
        const row = { id: `a-${availability.length + 1}`, ...(call.payload as object) };
        availability = [...availability, row];
        return ok(row);
      }
      if (call.op === 'delete') {
        availability = availability.filter(item => !isEq(call, 'id', item.id));
        return ok(null);
      }
      return ok(availability);
    },
    time_off: (call: TableCall) => {
      if (call.op === 'insert') {
        const payload = call.payload as { period: string };
        // PostgREST prints the range as Postgres does
        const [start, end] = payload.period.slice(1, -1).split(',');
        timeOff = [...timeOff, { id: `t-${timeOff.length + 1}`, period: `["${start}","${end}")` }];
        return ok(null);
      }
      if (call.op === 'delete') {
        timeOff = timeOff.filter(item => !isEq(call, 'id', item.id));
        return ok(null);
      }
      return ok(timeOff);
    },
    bookings: () => ok(bookings),
    profiles: () => ok([]),
  };
};

beforeEach(() => {
  fake.reset();
  signInProvider(fake);
  availability = [];
  timeOff = [];
  bookings = [];
  laborLock = true;
  setup();
});

const fillBooking = async (user: ReturnType<typeof userEvent.setup>, overrides: { price?: string } = {}) => {
  await user.selectOptions(await screen.findByLabelText('Cliente'), 'cli-1');
  fireEvent.change(screen.getByLabelText('Dia'), { target: { value: '2030-01-15' } });
  fireEvent.change(screen.getByLabelText('Início'), { target: { value: '09:00' } });
  fireEvent.change(screen.getByLabelText('Término'), { target: { value: '13:00' } });
  await user.type(screen.getByLabelText('Valor combinado (R$)'), overrides.price ?? '150,00');
};

describe('/pro/agenda: labor rule notice', () => {
  it('warns about the weekly limit of domestic occupations, with the number from the settings', async () => {
    renderPro('/pro/agenda');
    const notice = await screen.findByRole('note', { name: /Limite de 2 dias por semana com o mesmo cliente/ });
    expect(notice).toHaveTextContent('Diarista');
    expect(notice).toHaveTextContent('LC 150/2015');
    expect(notice).toHaveTextContent('Atendimentos cancelados não contam');
  });

  it('shows no notice for an occupation without the labor lock', async () => {
    laborLock = false;
    renderPro('/pro/agenda');
    await screen.findByRole('heading', { name: 'Próximos atendimentos' });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});

describe('/pro/agenda: weekly hours and days off', () => {
  it('adds and removes a weekly window', async () => {
    const user = userEvent.setup();
    renderPro('/pro/agenda');
    expect(await screen.findByText('Você ainda não definiu horários.')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Dia da semana'), '3');
    await user.click(screen.getByRole('button', { name: 'Adicionar horário' }));
    expect(await screen.findByText('09:00 às 18:00')).toBeInTheDocument();
    const insert = fake.tableCalls.find(call => call.table === 'availability' && call.op === 'insert');
    expect(insert?.payload).toEqual({ provider_id: 'prov-1', weekday: 3, start_time: '09:00', end_time: '18:00' });
    expect(screen.getByText('Quarta-feira', { selector: 'span' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remover Quarta-feira, 09:00 às 18:00' }));
    await waitFor(() => expect(screen.queryByText('09:00 às 18:00')).not.toBeInTheDocument());
  });

  it('refuses a window that ends before it starts', async () => {
    const user = userEvent.setup();
    renderPro('/pro/agenda');
    await screen.findByText('Você ainda não definiu horários.');
    fireEvent.change(screen.getByLabelText('Das'), { target: { value: '18:00' } });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '09:00' } });
    await user.click(screen.getByRole('button', { name: 'Adicionar horário' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('O horário de término precisa ser depois do início.');
    expect(availability).toEqual([]);
  });

  it('adds days off as whole São Paulo days and lists them', async () => {
    const user = userEvent.setup();
    renderPro('/pro/agenda');
    expect(await screen.findByText('Nenhuma folga marcada.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Primeiro dia'), { target: { value: '2030-02-04' } });
    fireEvent.change(screen.getByLabelText('Último dia'), { target: { value: '2030-02-06' } });
    await user.click(screen.getByRole('button', { name: 'Adicionar folga' }));

    expect(await screen.findByText('04/02/2030 a 06/02/2030')).toBeInTheDocument();
    const insert = fake.tableCalls.find(call => call.table === 'time_off' && call.op === 'insert');
    expect(insert?.payload).toEqual({ provider_id: 'prov-1', period: '[2030-02-04T03:00:00.000Z,2030-02-07T03:00:00.000Z)' });

    await user.click(screen.getByRole('button', { name: 'Remover folga de 04/02/2030 a 06/02/2030' }));
    expect(await screen.findByText('Nenhuma folga marcada.')).toBeInTheDocument();
  });
});

describe('/pro/agenda: own booking', () => {
  it('creates the booking from a CRM client, in São Paulo time and cents', async () => {
    fake.rpcs.create_own_booking = () => {
      bookings = [booking('b-1')];
      return ok('b-1');
    };
    const user = userEvent.setup();
    renderPro('/pro/agenda');
    await fillBooking(user);
    await user.click(screen.getByRole('button', { name: 'Criar atendimento' }));

    expect(await screen.findByText('Atendimento criado.')).toBeInTheDocument();
    expect(fake.rpcCalls.find(call => call.name === 'create_own_booking')?.args).toEqual({
      p_provider_client: 'cli-1',
      p_occupation: 'diarista',
      p_period: '[2030-01-15T12:00:00.000Z,2030-01-15T16:00:00.000Z)',
      p_price_cents: 15000,
      p_notes: null,
    });
    // The new booking is in the list, with a link to charge it
    expect(await screen.findByText('15/01/2030, 09:00 às 13:00')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cobrar' })).toHaveAttribute('href', '/pro/cobrancas?atendimento=b-1');
  });

  it('says why the third day of the week is refused (labor_lock)', async () => {
    fake.rpcs.create_own_booking = () => ruleError('labor_lock');
    const user = userEvent.setup();
    renderPro('/pro/agenda');
    await fillBooking(user);
    await user.click(screen.getByRole('button', { name: 'Criar atendimento' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('passaria do limite semanal de dias com o mesmo profissional na mesma casa');
    expect(alert).toHaveTextContent('LC 150/2015');
    expect(screen.queryByText('Atendimento criado.')).not.toBeInTheDocument();
  });

  it('says the time is taken (slot_unavailable), also when the exclusion constraint answers', async () => {
    fake.rpcs.create_own_booking = () => ruleError('slot_unavailable');
    const user = userEvent.setup();
    renderPro('/pro/agenda');
    await fillBooking(user);
    await user.click(screen.getByRole('button', { name: 'Criar atendimento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Este horário não está mais livre');

    fake.rpcs.create_own_booking = () => ({ data: null, error: { code: '23P01', message: 'conflicting key value violates exclusion constraint' } });
    await user.click(screen.getByRole('button', { name: 'Criar atendimento' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Este horário não está mais livre'));
  });

  it('checks the typed values before calling the database', async () => {
    const user = userEvent.setup();
    renderPro('/pro/agenda');
    await fillBooking(user, { price: 'barato' });
    await user.click(screen.getByRole('button', { name: 'Criar atendimento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o valor combinado em reais');
    expect(fake.rpcCalls.filter(call => call.name === 'create_own_booking')).toEqual([]);
  });

  it('sends the provider to the CRM when there are no clients yet', async () => {
    fake.tables.provider_clients = () => ok([]);
    renderPro('/pro/agenda');
    const link = await screen.findByRole('link', { name: 'Clientes' });
    expect(link).toHaveAttribute('href', '/pro/clientes');
    expect(screen.queryByRole('button', { name: 'Criar atendimento' })).not.toBeInTheDocument();
  });

  it('offers only clients of origin "own": create_own_booking refuses the ones that came by the platform', async () => {
    const client = (id: string, name: string, origin: string) => ({ id, client_id: null, name, phone: null, email: null, notes: null, origin, created_at: '2026-10-01T00:00:00Z' });
    fake.tables.provider_clients = () => ok([client('cli-1', 'Carlos Dias', 'own'), client('cli-2', 'Paula Plataforma', 'platform')]);
    renderPro('/pro/agenda?cliente=cli-2');
    const select = await screen.findByLabelText('Cliente');
    expect(within(select).getByRole('option', { name: 'Carlos Dias' })).toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: 'Paula Plataforma' })).not.toBeInTheDocument();
    expect(select).toHaveValue(''); // the preset of a platform client is ignored
  });

  it('explains that platform clients are served by requests when no client is the provider\'s own', async () => {
    fake.tables.provider_clients = () =>
      ok([{ id: 'cli-2', client_id: null, name: 'Paula Plataforma', phone: null, email: null, notes: null, origin: 'platform', created_at: '2026-10-01T00:00:00Z' }]);
    renderPro('/pro/agenda');
    expect(await screen.findByText(/primeiro cadastre um cliente seu/)).toBeInTheDocument();
    expect(screen.getByText(/Quem chegou pelo WorkEasy é atendido pelos pedidos/)).toBeInTheDocument();
  });

  it('preselects the client coming from the CRM', async () => {
    renderPro('/pro/agenda?cliente=cli-1');
    expect(await screen.findByLabelText('Cliente')).toHaveValue('cli-1');
  });
});

describe('/pro/agenda: bookings', () => {
  it('moves a booking along with transition_booking and translates a refusal', async () => {
    bookings = [booking('b-1', { status: 'accepted' }), booking('b-2', { status: 'requested', origin: 'platform', period: '[2030-01-16T12:00:00Z,2030-01-16T14:00:00Z)' })];
    fake.rpcs.transition_booking = () => ruleError('invalid_transition');
    const user = userEvent.setup();
    renderPro('/pro/agenda');

    const first = (await screen.findByText('15/01/2030, 09:00 às 13:00')).closest('li') as HTMLElement;
    expect(within(first).getByText('Confirmado')).toBeInTheDocument();
    expect(within(first).getByText('Cliente seu')).toBeInTheDocument();
    await user.click(within(first).getByRole('button', { name: 'Iniciar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta mudança de situação não é permitida agora');
    expect(fake.rpcCalls.find(call => call.name === 'transition_booking')?.args).toEqual({ p_booking: 'b-1', p_to: 'in_progress', p_reason: null });

    // A request from the platform: accept it, or refuse after confirming
    fake.rpcs.transition_booking = () => ok('accepted');
    const second = screen.getByText('16/01/2030, 09:00 às 11:00').closest('li') as HTMLElement;
    expect(within(second).getByText('Pelo WorkEasy')).toBeInTheDocument();
    expect(within(second).queryByRole('link', { name: 'Cobrar' })).not.toBeInTheDocument();
    await user.click(within(second).getByRole('button', { name: 'Aceitar' }));
    await waitFor(() => expect(fake.rpcCalls.at(-1)?.args).toEqual({ p_booking: 'b-2', p_to: 'accepted', p_reason: null }));
    await user.click(within(second).getByRole('button', { name: 'Recusar' }));
    await user.click(within(second).getByRole('button', { name: 'Sim' }));
    await waitFor(() => expect(fake.rpcCalls.at(-1)?.args).toEqual({ p_booking: 'b-2', p_to: 'canceled', p_reason: null }));
  });

  it('cancels the open charge after canceling an accepted booking (payments-void)', async () => {
    bookings = [booking('b-1', { status: 'accepted' })];
    fake.rpcs.transition_booking = () => ok('canceled');
    const user = userEvent.setup();
    renderPro('/pro/agenda');
    const item = (await screen.findByText('15/01/2030, 09:00 às 13:00')).closest('li') as HTMLElement;
    await user.click(within(item).getByRole('button', { name: 'Cancelar atendimento' }));
    await user.click(within(item).getByRole('button', { name: 'Sim' }));
    await waitFor(() => expect(fake.functionCalls).toEqual([{ name: 'payments-void', body: { booking_id: 'b-1' } }]));
    expect(screen.queryByText(/será cancelada em breve/)).not.toBeInTheDocument();
  });

  it('keeps the cancellation and warns when the charge could not be canceled right away', async () => {
    bookings = [booking('b-1', { status: 'accepted' })];
    fake.rpcs.transition_booking = () => ok('canceled');
    fake.functionsHandlers['payments-void'] = () => functionError(502, 'upstream_error');
    const user = userEvent.setup();
    renderPro('/pro/agenda');
    const item = (await screen.findByText('15/01/2030, 09:00 às 13:00')).closest('li') as HTMLElement;
    await user.click(within(item).getByRole('button', { name: 'Cancelar atendimento' }));
    await user.click(within(item).getByRole('button', { name: 'Sim' }));
    expect(await screen.findByText(/Atendimento cancelado\. A cobrança em aberto será cancelada em breve\./)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not look for a charge when only a request is refused', async () => {
    bookings = [booking('b-2', { status: 'requested', origin: 'platform' })];
    fake.rpcs.transition_booking = () => ok('canceled');
    const user = userEvent.setup();
    renderPro('/pro/agenda');
    const item = (await screen.findByText('15/01/2030, 09:00 às 13:00')).closest('li') as HTMLElement;
    await user.click(within(item).getByRole('button', { name: 'Recusar' }));
    await user.click(within(item).getByRole('button', { name: 'Sim' }));
    await waitFor(() => expect(fake.rpcCalls.at(-1)?.args).toEqual({ p_booking: 'b-2', p_to: 'canceled', p_reason: null }));
    expect(fake.functionCalls).toEqual([]);
  });

  it('keeps finished and canceled bookings under "Anteriores"', async () => {
    bookings = [booking('b-1', { status: 'canceled' }), booking('b-2', { status: 'completed', period: '[2030-01-16T12:00:00Z,2030-01-16T14:00:00Z)' })];
    renderPro('/pro/agenda');
    expect(await screen.findByText(/Nenhum atendimento marcado/)).toBeInTheDocument();
    const past = screen.getByRole('heading', { name: 'Anteriores' }).closest('section') as HTMLElement;
    expect(within(past).getByText('Cancelado')).toBeInTheDocument();
    expect(within(past).getByText('Concluído')).toBeInTheDocument();
    // Completed own bookings can still be charged
    expect(within(past).getAllByRole('link', { name: 'Cobrar' })).toHaveLength(1);
  });
});
