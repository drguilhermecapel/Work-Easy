import { afterEach, beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CAREGIVER_ID,
  OTHER_CAREGIVER_ID,
  approvedProvider,
  household,
  isRpc,
  mockGeolocation,
  newWorld,
  pgRange,
  recipient,
  removeGeolocation,
  shiftRow,
  useWorld,
  type CareWorld,
  type FakeSupabase,
} from './fake';

vi.mock('../../lib/supabase', async () => {
  const { createFakeSupabase } = await import('../web/fakeSupabase');
  return { supabase: createFakeSupabase(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { renderCare } = await import('./render');
const fake = supabase as unknown as FakeSupabase;

let world: CareWorld;

// 2030-01-15 is a Tuesday; the shift is 08:00-20:00 in São Paulo (11:00-23:00 UTC)
const START = new Date('2030-01-15T11:00:00Z');
const END = new Date('2030-01-15T23:00:00Z');

/** Freezes only the clock (timers stay real so waitFor and user-event keep working). */
const setNow = (iso: string) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
};

const offeredShift = (overrides: Record<string, unknown> = {}) => {
  world.shifts = [shiftRow({ status: 'offered', notes: 'Almoço já fica pronto', ...overrides })];
  world.offers = [
    { shift_id: 'shift-1', provider_id: CAREGIVER_ID, status: 'offered', created_at: '2030-01-03T10:00:00Z' },
    { shift_id: 'shift-1', provider_id: OTHER_CAREGIVER_ID, status: 'offered', created_at: '2030-01-03T10:00:00Z' },
  ];
};

const assignedShift = (overrides: Record<string, unknown> = {}) => {
  world.shifts = [shiftRow({ status: 'assigned', provider_id: CAREGIVER_ID, ...overrides })];
  world.offers = [{ shift_id: 'shift-1', provider_id: CAREGIVER_ID, status: 'accepted', created_at: '2030-01-03T10:00:00Z' }];
};

const locationConsent = (granted: boolean) => ({
  id: 'c-location',
  user_id: CAREGIVER_ID,
  purpose: 'location',
  version: '2026-10',
  granted,
  at: '2030-01-02T10:00:00Z',
});

const consentInserts = () => fake.tableCalls.filter(call => call.table === 'consents' && call.op === 'insert');

describe('/pro/plantoes (caregiver)', () => {
  // The device is far from Brasília: times must still read as São Paulo time
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'Asia/Tokyo';
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  beforeEach(() => {
    sessionStorage.clear();
    fake.reset();
    world = newWorld(CAREGIVER_ID);
    world.provider = approvedProvider(CAREGIVER_ID);
    world.households = [household()];
    world.recipients = [recipient()];
    useWorld(fake, world);
  });

  afterEach(() => {
    vi.useRealTimers();
    removeGeolocation();
  });

  describe('access', () => {
    it('sends visitors to /entrar', async () => {
      fake.session = null;
      renderCare('/pro/plantoes');
      expect(await screen.findByTestId('where')).toHaveTextContent('/entrar?next=%2Fpro%2Fplantoes');
    });

    it('asks a user without a provider record to sign up first', async () => {
      world.provider = null;
      renderCare('/pro/plantoes');
      expect(await screen.findByText(/Você ainda não é profissional no WorkEasy/)).toBeInTheDocument();
    });
  });

  describe('offers', () => {
    it('shows an offer with the first name, neighborhood, time and payout, and nothing else about the family', async () => {
      offeredShift();
      renderCare('/pro/plantoes');
      const offers = await screen.findByRole('region', { name: 'Ofertas para você' });
      expect(await within(offers).findByText('ter., 15/01/2030, 08:00 às 20:00')).toBeInTheDocument();
      expect(within(offers).getByText('Cuidado de Lúcia · Bairro Lapa')).toBeInTheDocument();
      expect(within(offers).getByText('Valor: R$ 280,00')).toBeInTheDocument();
      expect(within(offers).getByText(/Observações da família: Almoço já fica pronto/)).toBeInTheDocument();
      // No contact, preferences, birth year, family value or house name reach the caregiver
      const page = document.body.textContent ?? '';
      expect(page).not.toMatch(/Filho 11|Gosta de rádio|1940|Casa da vó/);
      expect(fake.tableCalls.some(call => call.table === 'shifts' || call.table === 'care_recipients' || call.table === 'households')).toBe(false);
    });

    it('accepts an offer and moves it to my shifts', async () => {
      offeredShift();
      renderCare('/pro/plantoes');
      await userEvent.click(await screen.findByRole('button', { name: 'Aceitar plantão' }));

      expect(await screen.findByText(/Plantão aceito: ter\., 15\/01\/2030, 08:00 às 20:00/)).toBeInTheDocument();
      expect(isRpc(fake, 'accept_shift_offer')[0].args).toEqual({ p_shift: 'shift-1' });
      const mine = screen.getByRole('region', { name: 'Meus plantões' });
      expect(await within(mine).findByText('Cuidador confirmado')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Aceitar plantão' })).not.toBeInTheDocument();
      expect(world.offers.find(o => o.provider_id === OTHER_CAREGIVER_ID)?.status).toBe('expired');
    });

    it('says another caregiver already accepted when the offer expired under the caregiver', async () => {
      offeredShift();
      renderCare('/pro/plantoes');
      const button = await screen.findByRole('button', { name: 'Aceitar plantão' });
      // The other caregiver is faster
      world.shifts[0].status = 'assigned';
      world.shifts[0].provider_id = OTHER_CAREGIVER_ID;
      world.offers[0].status = 'expired';
      await userEvent.click(button);

      expect(await screen.findByRole('alert')).toHaveTextContent(/outro cuidador aceitou primeiro, a família cancelou ou a oferta venceu/);
      expect(screen.queryByRole('button', { name: 'Aceitar plantão' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Atualizar a lista' }));
      expect(await screen.findByText(/1 oferta encerrada: outro cuidador aceitou primeiro ou a família cancelou/)).toBeInTheDocument();
      expect(screen.getByText('Nenhuma oferta agora.', { exact: false })).toBeInTheDocument();
    });

    it('lists an expired offer that is still returned by the database as taken by another caregiver', async () => {
      world.shifts = [shiftRow({ status: 'assigned', provider_id: OTHER_CAREGIVER_ID })];
      world.offers = [{ shift_id: 'shift-1', provider_id: CAREGIVER_ID, status: 'expired', created_at: '' }];
      // caregiver_shifts() of this fake only returns rows of the caregiver; an updated database may return the expired one too
      fake.rpcs.caregiver_shifts = () => ({
        data: [
          {
            shift_id: 'shift-1',
            period: shiftRow().period,
            status: 'assigned',
            offer_status: 'expired',
            caregiver_payout_cents: 28000,
            notes: null,
            neighborhood_name: 'Lapa',
            recipient_first_name: 'Lúcia',
          },
        ],
        error: null,
      });
      renderCare('/pro/plantoes');
      expect(await screen.findByText(/outro cuidador já aceitou este plantão/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Aceitar plantão' })).not.toBeInTheDocument();
    });

    it('explains the labor lock when the database refuses the acceptance', async () => {
      offeredShift();
      world.rpcErrors.accept_shift_offer = 'labor_lock';
      renderCare('/pro/plantoes');
      await userEvent.click(await screen.findByRole('button', { name: 'Aceitar plantão' }));
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Limite de 2 dias por semana com o mesmo cuidador');
      expect(alert).toHaveTextContent(/passaria de 2 dias diferentes na mesma semana/);
      expect(alert).toHaveTextContent(/LC 150\/2015/);
      expect(alert).toHaveTextContent(/a família pode contratar você diretamente, fora do WorkEasy/);
      // The offer stays: the caregiver may try another shift or wait for the family
      expect(screen.getByRole('button', { name: 'Aceitar plantão' })).toBeInTheDocument();
    });

    it('says when two shifts overlap', async () => {
      offeredShift();
      world.rpcErrors.accept_shift_offer = 'slot_unavailable';
      renderCare('/pro/plantoes');
      await userEvent.click(await screen.findByRole('button', { name: 'Aceitar plantão' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Você já tem outro plantão neste horário.');
    });

    it('says what to expect when there is nothing', async () => {
      renderCare('/pro/plantoes');
      expect(await screen.findByText(/Nenhuma oferta agora/)).toBeInTheDocument();
      expect(screen.getByText(/cadastro precisa estar aprovado em uma ocupação de cuidado/)).toBeInTheDocument();
      expect(screen.getByText('Você não tem plantões confirmados no momento.')).toBeInTheDocument();
    });
  });

  describe('check-in and check-out with location', () => {
    it('registers the entrance inside the window with the coordinates, recording the consent first', async () => {
      assignedShift();
      setNow('2030-01-15T10:00:00Z'); // 07:00 in São Paulo: one hour before the start
      const geo = mockGeolocation({ lat: -23.5613449, lng: -46.6565712 });
      renderCare('/pro/plantoes');

      expect(await screen.findByText(/Registro aberto até as 10:00/)).toBeInTheDocument();
      const box = screen.getByRole('checkbox', { name: /Enviar minha localização neste registro/ });
      expect(box).not.toBeChecked();
      await userEvent.click(box);
      await userEvent.click(screen.getByRole('button', { name: 'Registrar entrada' }));

      expect(await screen.findByText(/Entrada registrada às 07:00/)).toBeInTheDocument();
      expect(consentInserts()[0].payload).toMatchObject({ purpose: 'location', granted: true });
      expect(geo.calls).toHaveLength(1);
      expect(isRpc(fake, 'check_in')[0].args).toEqual({ p_shift: 'shift-1', p_kind: 'in', p_lat: -23.561345, p_lng: -46.656571 });
      expect(screen.queryByText(/ficou sem localização/)).not.toBeInTheDocument();
      // Now the shift is in progress and the exit is next
      expect(await screen.findByText('Em andamento')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Registrar saída' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Ver local do registro/ })).toBeInTheDocument();
    });

    it('does not ask the consent again when it was already granted, and starts with the box ticked', async () => {
      world.consents = [...world.consents, locationConsent(true)];
      assignedShift();
      setNow('2030-01-15T11:05:00Z');
      mockGeolocation({ lat: -23.5, lng: -46.6 });
      renderCare('/pro/plantoes');
      expect(await screen.findByRole('checkbox', { name: /Enviar minha localização/ })).toBeChecked();
      await userEvent.click(screen.getByRole('button', { name: 'Registrar entrada' }));
      await screen.findByText(/Entrada registrada às 08:05/);
      expect(consentInserts()).toHaveLength(0);
      expect(isRpc(fake, 'check_in')[0].args).toMatchObject({ p_lat: -23.5, p_lng: -46.6 });
    });

    it('registers without coordinates, and warns, when the device denies the location', async () => {
      assignedShift();
      setNow('2030-01-15T11:00:00Z');
      mockGeolocation({ code: 1 });
      renderCare('/pro/plantoes');
      await userEvent.click(await screen.findByRole('checkbox', { name: /Enviar minha localização/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Registrar entrada' }));

      expect(await screen.findByText(/Entrada registrada às 08:00/)).toBeInTheDocument();
      const warning = screen.getByText(/O registro ficou sem localização/);
      expect(warning).toHaveTextContent(/A localização está bloqueada neste aparelho/);
      expect(warning).toHaveTextContent(/A família verá que a localização não foi enviada/);
      expect(isRpc(fake, 'check_in')[0].args).toEqual({ p_shift: 'shift-1', p_kind: 'in' });
      expect(await screen.findByText('sem localização')).toBeInTheDocument();
    });

    it('registers without asking the device when the caregiver unticks the location', async () => {
      world.consents = [...world.consents, locationConsent(true)];
      assignedShift();
      setNow('2030-01-15T11:00:00Z');
      const geo = mockGeolocation({ lat: -23.5, lng: -46.6 });
      renderCare('/pro/plantoes');
      await userEvent.click(await screen.findByRole('checkbox', { name: /Enviar minha localização/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Registrar entrada' }));

      expect(await screen.findByText(/Você escolheu não enviar a localização/)).toBeInTheDocument();
      expect(geo.calls).toHaveLength(0);
      expect(isRpc(fake, 'check_in')[0].args).toEqual({ p_shift: 'shift-1', p_kind: 'in' });
    });

    it('registers when the device has no location at all', async () => {
      assignedShift();
      setNow('2030-01-15T11:00:00Z');
      removeGeolocation();
      renderCare('/pro/plantoes');
      await userEvent.click(await screen.findByRole('checkbox', { name: /Enviar minha localização/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Registrar entrada' }));
      expect(await screen.findByText(/Este aparelho ou navegador não oferece localização/)).toBeInTheDocument();
      expect(isRpc(fake, 'check_in')).toHaveLength(1);
    });

    it('translates the 2-hour window when the entrance is too early', async () => {
      assignedShift();
      setNow('2030-01-15T07:00:00Z'); // 04:00 in São Paulo: four hours before the start
      mockGeolocation({ lat: -23.5, lng: -46.6 });
      renderCare('/pro/plantoes');

      expect(await screen.findByText(/O registro abre às 06:00 \(2 horas antes do início do plantão\)/)).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Registrar entrada' }));
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Fora do horário de registro. A entrada vale de 2 horas antes a 2 horas depois do início do plantão');
      expect(alert).not.toHaveTextContent('checkin_window');
      expect(world.checkins).toHaveLength(0);
      // Still possible to try again later
      expect(screen.getByRole('button', { name: 'Registrar entrada' })).toBeEnabled();
    });

    it('says on which day the window opens when it is not today', async () => {
      assignedShift();
      setNow('2030-01-13T12:00:00Z'); // two days before
      renderCare('/pro/plantoes');
      expect(await screen.findByText(/O registro abre em ter\., 15\/01\/2030, 06:00 \(2 horas antes do início do plantão\)/)).toBeInTheDocument();
    });

    it('follows the clock: the hint changes when the window opens, without reloading', async () => {
      assignedShift();
      vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
      vi.setSystemTime(new Date('2030-01-15T08:00:00Z')); // 05:00 in São Paulo
      renderCare('/pro/plantoes');
      expect(await screen.findByText(/O registro abre às 06:00/)).toBeInTheDocument();
      await act(async () => {
        vi.setSystemTime(new Date('2030-01-15T10:00:00Z')); // 07:00
        vi.advanceTimersByTime(31_000);
      });
      expect(await screen.findByText(/Registro aberto até as 10:00/)).toBeInTheDocument();
      expect(screen.queryByText(/O registro abre/)).not.toBeInTheDocument();
    });

    it('translates the window when the entrance is too late', async () => {
      assignedShift();
      setNow('2030-01-15T14:00:00Z'); // 11:00 in São Paulo: three hours after the start
      renderCare('/pro/plantoes');
      expect(await screen.findByText(/O prazo para este registro terminou às 10:00/)).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Registrar entrada' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/Fora do horário de registro/);
    });

    it('registers the exit around the end of the shift', async () => {
      assignedShift({ status: 'checked_in' });
      world.checkins = [{ id: 'ck-1', shift_id: 'shift-1', provider_id: CAREGIVER_ID, kind: 'in', at: '2030-01-15T11:02:00Z', lat: null, lng: null }];
      setNow(END.toISOString());
      mockGeolocation({ lat: -23.5, lng: -46.6 });
      renderCare('/pro/plantoes');
      expect(screen.queryByRole('button', { name: 'Registrar entrada' })).not.toBeInTheDocument();
      await userEvent.click(await screen.findByRole('checkbox', { name: /Enviar minha localização/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Registrar saída' }));
      expect(await screen.findByText(/Saída registrada às 20:00/)).toBeInTheDocument();
      expect(isRpc(fake, 'check_in')[0].args).toMatchObject({ p_kind: 'out' });
      expect(await screen.findByText('Concluído')).toBeInTheDocument();
    });

    it('does not offer the entrance again once done, and shows the records of the shift', async () => {
      assignedShift({ status: 'checked_in' });
      world.checkins = [{ id: 'ck-1', shift_id: 'shift-1', provider_id: CAREGIVER_ID, kind: 'in', at: '2030-01-15T11:02:00Z', lat: '-23.5', lng: '-46.6' }];
      renderCare('/pro/plantoes');
      const records = await screen.findByRole('list', { name: 'Registros deste plantão' });
      expect(within(records).getByText('Entrada:')).toBeInTheDocument();
      expect(within(records).getByText(/ter\., 15\/01\/2030, 08:02/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Registrar entrada' })).not.toBeInTheDocument();
    });

    it('stops when the consent cannot be recorded, without reading the location', async () => {
      assignedShift();
      setNow('2030-01-15T11:00:00Z');
      const geo = mockGeolocation({ lat: -23.5, lng: -46.6 });
      renderCare('/pro/plantoes');
      const box = await screen.findByRole('checkbox', { name: /Enviar minha localização/ });
      // Reads keep working; only the write of the consent fails
      const read = fake.tables.consents;
      fake.tables.consents = call => (call.op === 'insert' ? { data: null, error: { code: '42501', message: 'rls' } } : read(call));
      await userEvent.click(box);
      await userEvent.click(screen.getByRole('button', { name: 'Registrar entrada' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/Você não tem permissão/);
      expect(geo.calls).toHaveLength(0);
      expect(isRpc(fake, 'check_in')).toHaveLength(0);
    });
  });

  describe('daily report', () => {
    beforeEach(() => {
      assignedShift({ status: 'checked_in' });
      world.checkins = [{ id: 'ck-1', shift_id: 'shift-1', provider_id: CAREGIVER_ID, kind: 'in', at: '2030-01-15T11:02:00Z', lat: null, lng: null }];
    });

    it('sends meals, activities, mood and notes as plain text, with a notice that it is not clinical', async () => {
      renderCare('/pro/plantoes');
      const form = await screen.findByRole('form', { name: 'Relatório do dia' });
      expect(within(form).getByText(/O WorkEasy não guarda dados de saúde/)).toBeInTheDocument();
      expect(within(form).getByText(/Não registre remédios, doses, sintomas nem diagnósticos/)).toBeInTheDocument();
      await userEvent.type(within(form).getByLabelText('Refeições'), 'Almoço e lanche');
      await userEvent.type(within(form).getByLabelText('Atividades'), 'Caminhada no jardim');
      await userEvent.type(within(form).getByLabelText('Humor'), 'Animada');
      await userEvent.type(within(form).getByLabelText('Observações'), 'Recebeu a visita da neta');
      await userEvent.click(within(form).getByRole('button', { name: 'Enviar relatório' }));

      expect(await within(form).findByText(/Relatório enviado/)).toBeInTheDocument();
      expect(isRpc(fake, 'submit_daily_report')[0].args).toEqual({
        p_shift: 'shift-1',
        p_meals: 'Almoço e lanche',
        p_activities: 'Caminhada no jardim',
        p_mood: 'Animada',
        p_notes: 'Recebeu a visita da neta',
      });
      expect(world.reports).toHaveLength(1);
    });

    it('refuses an empty report and one that carries health information', async () => {
      renderCare('/pro/plantoes');
      const form = await screen.findByRole('form', { name: 'Relatório do dia' });
      await userEvent.click(within(form).getByRole('button', { name: 'Enviar relatório' }));
      expect(await within(form).findByRole('alert')).toHaveTextContent('Preencha ao menos um campo do relatório.');

      await userEvent.type(within(form).getByLabelText('Observações'), 'Tomou o remédio das 8h');
      await userEvent.click(within(form).getByRole('button', { name: 'Enviar relatório' }));
      await waitFor(() => expect(within(form).getByRole('alert')).toHaveTextContent(/informação de saúde/));
      expect(isRpc(fake, 'submit_daily_report')).toHaveLength(0);
    });

    it('edits a report already sent (the new one replaces it)', async () => {
      world.reports = [{ id: 'r-1', shift_id: 'shift-1', provider_id: CAREGIVER_ID, meals: 'Almoço', activities: null, mood: null, notes: null, created_at: '' }];
      renderCare('/pro/plantoes');
      const summary = await screen.findByText('Relatório do dia (já enviado)');
      await userEvent.click(summary);
      const form = screen.getByRole('form', { name: 'Relatório do dia' });
      const meals = within(form).getByLabelText('Refeições');
      expect(meals).toHaveValue('Almoço');
      await userEvent.type(meals, ' e jantar');
      await userEvent.click(within(form).getByRole('button', { name: 'Atualizar relatório' }));
      await within(form).findByText(/o relatório anterior é substituído/);
      expect(isRpc(fake, 'submit_daily_report')[0].args).toMatchObject({ p_meals: 'Almoço e jantar' });
      expect(world.reports).toHaveLength(1);
    });

    it('says the report needs the entrance when the database refuses it', async () => {
      world.rpcErrors.submit_daily_report = 'not_allowed';
      renderCare('/pro/plantoes');
      const form = await screen.findByRole('form', { name: 'Relatório do dia' });
      await userEvent.type(within(form).getByLabelText('Humor'), 'Calma');
      await userEvent.click(within(form).getByRole('button', { name: 'Enviar relatório' }));
      expect(await within(form).findByRole('alert')).toHaveTextContent(/depois do registro de entrada/);
    });
  });

  describe('canceling', () => {
    it('gives the shift back after confirming; it reopens and is offered again', async () => {
      assignedShift();
      world.offers.push({ shift_id: 'shift-1', provider_id: OTHER_CAREGIVER_ID, status: 'expired', created_at: '' });
      renderCare('/pro/plantoes');
      await userEvent.type(await screen.findByLabelText('Motivo para desistir (opcional)'), 'Imprevisto');
      await userEvent.click(screen.getByRole('button', { name: 'Cancelar meu plantão' }));
      expect(isRpc(fake, 'cancel_shift')).toHaveLength(0);
      expect(screen.getByRole('group')).toHaveTextContent(/volta a ficar aberto e é oferecido de novo aos outros cuidadores/);
      await userEvent.click(screen.getByRole('button', { name: 'Sim, cancelar' }));

      expect(await screen.findByText(/Plantão cancelado. Ele foi devolvido à família/)).toBeInTheDocument();
      expect(isRpc(fake, 'cancel_shift')[0].args).toEqual({ p_shift: 'shift-1', p_reason: 'Imprevisto' });
      expect(world.shifts[0]).toMatchObject({ provider_id: null, status: 'offered' });
      expect(world.offers.find(o => o.provider_id === OTHER_CAREGIVER_ID)?.status).toBe('offered');
      expect(world.offers.find(o => o.provider_id === CAREGIVER_ID)?.status).toBe('declined');
      await waitFor(() => expect(screen.getByText('Você não tem plantões confirmados no momento.')).toBeInTheDocument());
    });

    it('does not offer the cancellation once the shift started', async () => {
      assignedShift({ status: 'checked_in' });
      renderCare('/pro/plantoes');
      await screen.findByText('Em andamento');
      expect(screen.queryByRole('button', { name: 'Cancelar meu plantão' })).not.toBeInTheDocument();
    });

    it('explains the refusal of the database', async () => {
      assignedShift();
      world.rpcErrors.cancel_shift = 'invalid_transition';
      renderCare('/pro/plantoes');
      await userEvent.click(await screen.findByRole('button', { name: 'Cancelar meu plantão' }));
      await userEvent.click(screen.getByRole('button', { name: 'Sim, cancelar' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('O plantão só pode ser cancelado antes de começar');
    });
  });

  it('shows past shifts apart, with the family cancellation', async () => {
    world.shifts = [
      shiftRow({ id: 'shift-1', status: 'completed', provider_id: CAREGIVER_ID }),
      shiftRow({
        id: 'shift-2',
        status: 'canceled',
        provider_id: CAREGIVER_ID,
        period: pgRange(new Date(START.getTime() + 24 * 3_600_000), new Date(END.getTime() + 24 * 3_600_000)),
      }),
    ];
    world.offers = [
      { shift_id: 'shift-1', provider_id: CAREGIVER_ID, status: 'accepted', created_at: '' },
      { shift_id: 'shift-2', provider_id: CAREGIVER_ID, status: 'accepted', created_at: '' },
    ];
    renderCare('/pro/plantoes');
    const past = await screen.findByRole('region', { name: 'Anteriores' });
    expect(within(past).getByText('Concluído')).toBeInTheDocument();
    expect(within(past).getByText('Cancelado')).toBeInTheDocument();
  });
});
