import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CAREGIVER_ID,
  FAMILY_ID,
  household,
  isRpc,
  newWorld,
  pgRange,
  recipient,
  shiftRow,
  useWorld,
  type CareWorld,
  type FakeSupabase,
} from './fake';

vi.mock('../../lib/supabase', async () => {
  const { createFakeSupabase } = await import('../web/fakeSupabase');
  return { supabase: createFakeSupabase(), backendEnabled: true };
});

// The catalog is being rebuilt elsewhere: pin the one care occupation these tests use
vi.mock('../../catalog', async importOriginal => ({
  ...(await importOriginal<typeof import('../../catalog')>()),
  findOccupation: (slug: string) => (slug === 'cuidador-de-idosos' ? { slug, name: 'Cuidador de idosos' } : undefined),
}));

const { supabase } = await import('../../lib/supabase');
const { renderCare } = await import('./render');
const fake = supabase as unknown as FakeSupabase;

let world: CareWorld;

const callsOn = (table: string, op: string) => fake.tableCalls.filter(call => call.table === table && call.op === op);

describe('family screens of the care line', () => {
  // The device is far from Brasília: times must still be typed and read as São Paulo time
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
    world = newWorld(FAMILY_ID);
    useWorld(fake, world);
  });

  describe('/cuidado (houses and care recipients)', () => {
    it('sends visitors to /entrar', async () => {
      fake.session = null;
      renderCare('/cuidado');
      expect(await screen.findByTestId('where')).toHaveTextContent('/entrar?next=%2Fcuidado');
    });

    it('says in so many words that no health data is kept, and asks for none', async () => {
      renderCare('/cuidado');
      expect(await screen.findByText(/Você ainda não cadastrou uma casa/)).toBeInTheDocument();
      expect(screen.getAllByText(/O WorkEasy não guarda dados de saúde/).length).toBeGreaterThan(0);
      world.households = [household()];
      renderCare('/cuidado');
      await userEvent.click((await screen.findAllByRole('button', { name: /Cadastrar pessoa cuidada/ }))[0]);
      expect(screen.getByLabelText('Primeiro nome')).toBeInTheDocument();
      expect(screen.queryByLabelText(/diagnóstico|medicamento|remédio|doença|exame/i)).not.toBeInTheDocument();
    });

    it('creates a house with name, neighborhood and notes', async () => {
      renderCare('/cuidado');
      const form = await screen.findByRole('form', { name: 'Nova casa' });
      await userEvent.type(within(form).getByLabelText('Nome da casa'), '  Casa da vó ');
      await userEvent.selectOptions(within(form).getByLabelText('Bairro'), 'nb-lapa');
      await userEvent.type(within(form).getByLabelText(/Observações sobre a casa/), 'Portaria 24 horas');
      await userEvent.click(within(form).getByRole('button', { name: 'Cadastrar casa' }));

      expect(await screen.findByRole('heading', { name: /Casa da vó/ })).toBeInTheDocument();
      expect(screen.getByText('Bairro: Lapa')).toBeInTheDocument();
      expect(callsOn('households', 'insert')[0].payload).toEqual({
        owner_id: FAMILY_ID,
        name: 'Casa da vó',
        neighborhood_id: 'nb-lapa',
        notes: 'Portaria 24 horas',
      });
    });

    it('refuses a house without a name', async () => {
      renderCare('/cuidado');
      const form = await screen.findByRole('form', { name: 'Nova casa' });
      await userEvent.click(within(form).getByRole('button', { name: 'Cadastrar casa' }));
      expect(await within(form).findByRole('alert')).toHaveTextContent(/Dê um nome para a casa/);
      expect(callsOn('households', 'insert')).toHaveLength(0);
    });

    it('edits a house', async () => {
      world.households = [household()];
      renderCare('/cuidado');
      await userEvent.click(await screen.findByRole('button', { name: 'Editar a casa Casa da vó' }));
      const form = screen.getByRole('form', { name: 'Editar a casa Casa da vó' });
      const name = within(form).getByLabelText('Nome da casa');
      await userEvent.clear(name);
      await userEvent.type(name, 'Apartamento');
      await userEvent.selectOptions(within(form).getByLabelText('Bairro'), 'nb-moema');
      await userEvent.click(within(form).getByRole('button', { name: 'Salvar casa' }));

      expect(await screen.findByRole('heading', { name: /Apartamento/ })).toBeInTheDocument();
      expect(screen.getByText('Bairro: Moema')).toBeInTheDocument();
      expect(callsOn('households', 'update')[0].payload).toMatchObject({ name: 'Apartamento', neighborhood_id: 'nb-moema' });
    });

    it('asks before deleting a house and says what goes with it', async () => {
      world.households = [household()];
      world.recipients = [recipient()];
      renderCare('/cuidado');
      await userEvent.click(await screen.findByRole('button', { name: 'Apagar casa' }));
      const group = screen.getByRole('group', { name: /Apagar “Casa da vó”\?/ });
      expect(group).toHaveTextContent(/assistidos, plantões, registros de entrada e saída e relatórios/);
      expect(callsOn('households', 'delete')).toHaveLength(0);
      await userEvent.click(within(group).getByRole('button', { name: 'Apagar casa e tudo dela' }));
      expect(await screen.findByText(/Você ainda não cadastrou uma casa/)).toBeInTheDocument();
      expect(callsOn('households', 'delete')).toHaveLength(1);
    });

    it('warns before deleting a house that has a caregiver confirmed for a shift that has not ended', async () => {
      world.households = [household()];
      world.recipients = [recipient()];
      world.shifts = [
        shiftRow({ id: 'shift-a', status: 'assigned', provider_id: CAREGIVER_ID }),
        shiftRow({ id: 'shift-b', status: 'checked_in', provider_id: CAREGIVER_ID }),
        // Not counted: no caregiver yet, already over, and canceled
        shiftRow({ id: 'shift-c', status: 'offered' }),
        shiftRow({
          id: 'shift-d',
          status: 'completed',
          provider_id: CAREGIVER_ID,
          period: pgRange(new Date('2020-01-15T11:00:00Z'), new Date('2020-01-15T23:00:00Z')),
        }),
        shiftRow({ id: 'shift-e', status: 'canceled', provider_id: null }),
      ];
      renderCare('/cuidado');
      await userEvent.click(await screen.findByRole('button', { name: 'Apagar casa' }));
      const group = screen.getByRole('group', { name: /Apagar “Casa da vó”\?/ });
      expect(group).toHaveTextContent('Há 2 plantões com cuidador confirmado que ainda não terminaram');
      expect(group).toHaveTextContent(/o app não avisa o cuidador/);
      expect(group).toHaveTextContent(/Cancele antes/);
    });

    it('does not warn about caregivers when the house has none confirmed', async () => {
      world.households = [household()];
      world.shifts = [shiftRow({ status: 'offered' })];
      renderCare('/cuidado');
      await userEvent.click(await screen.findByRole('button', { name: 'Apagar casa' }));
      expect(screen.getByRole('group', { name: /Apagar “Casa da vó”\?/ })).not.toHaveTextContent(/cuidador confirmado/);
    });

    it('adds a care recipient with first name, birth year, preferences and emergency contact only', async () => {
      world.households = [household()];
      renderCare('/cuidado');
      await userEvent.click(await screen.findByRole('button', { name: /Cadastrar pessoa cuidada/ }));
      const form = screen.getByRole('form', { name: 'Novo assistido' });
      await userEvent.type(within(form).getByLabelText('Primeiro nome'), 'Lúcia');
      await userEvent.type(within(form).getByLabelText(/Ano de nascimento/), '1940');
      await userEvent.type(within(form).getByLabelText(/Preferências/), 'Gosta de rádio de manhã');
      await userEvent.type(within(form).getByLabelText(/Contato de emergência/), 'Filho, 11 90000-0000');
      await userEvent.click(within(form).getByRole('button', { name: 'Cadastrar pessoa' }));

      expect(await screen.findByText(/nascido\(a\) em 1940/)).toBeInTheDocument();
      expect(callsOn('care_recipients', 'insert')[0].payload).toEqual({
        household_id: 'house-1',
        first_name: 'Lúcia',
        birth_year: 1940,
        preferences: 'Gosta de rádio de manhã',
        emergency_contact: 'Filho, 11 90000-0000',
      });
    });

    it('refuses health information in any text, and a surname', async () => {
      world.households = [household()];
      renderCare('/cuidado');
      await userEvent.click(await screen.findByRole('button', { name: /Cadastrar pessoa cuidada/ }));
      const form = screen.getByRole('form', { name: 'Novo assistido' });
      await userEvent.type(within(form).getByLabelText('Primeiro nome'), 'Lúcia Souza');
      await userEvent.click(within(form).getByRole('button', { name: 'Cadastrar pessoa' }));
      expect(await within(form).findByRole('alert')).toHaveTextContent(/só o primeiro nome/);

      const name = within(form).getByLabelText('Primeiro nome');
      await userEvent.clear(name);
      await userEvent.type(name, 'Lúcia');
      await userEvent.type(within(form).getByLabelText(/Preferências/), 'Toma remédio para a pressão às 8h');
      await userEvent.click(within(form).getByRole('button', { name: 'Cadastrar pessoa' }));
      await waitFor(() => expect(within(form).getByRole('alert')).toHaveTextContent(/informação de saúde.*remédio/));
      expect(within(form).getByRole('alert')).toHaveTextContent(/O WorkEasy não guarda dados de saúde/);
      expect(callsOn('care_recipients', 'insert')).toHaveLength(0);
    });

    it('edits and removes a care recipient', async () => {
      world.households = [household()];
      world.recipients = [recipient()];
      renderCare('/cuidado');
      await userEvent.click(await screen.findByRole('button', { name: 'Editar Lúcia' }));
      const form = screen.getByRole('form', { name: 'Editar Lúcia' });
      const prefs = within(form).getByLabelText(/Preferências/);
      await userEvent.clear(prefs);
      await userEvent.type(prefs, 'Prefere chá');
      await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }));
      expect(await screen.findByText(/Preferências: Prefere chá/)).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Remover' }));
      await userEvent.click(screen.getByRole('button', { name: 'Remover pessoa' }));
      await waitFor(() => expect(screen.queryByText(/nascido\(a\) em 1940/)).not.toBeInTheDocument());
      expect(callsOn('care_recipients', 'delete')).toHaveLength(1);
    });
  });

  describe('/cuidado/plantoes', () => {
    beforeEach(() => {
      world.households = [household()];
      world.recipients = [recipient()];
    });

    it('creates a shift typed in São Paulo time with its value', async () => {
      renderCare('/cuidado/plantoes?casa=house-1');
      const form = await screen.findByRole('form', { name: 'Novo plantão' });
      await userEvent.selectOptions(within(form).getByLabelText('Pessoa cuidada'), 'rec-1');
      await userEvent.type(within(form).getByLabelText('Dia de início'), '2030-01-15');
      await userEvent.type(within(form).getByLabelText(/Valor do plantão/), '280,00');
      await userEvent.type(within(form).getByLabelText(/Observações para o cuidador/), 'Almoço já fica pronto');
      expect(within(form).getByText(/ter\., 15\/01\/2030, 08:00 às 20:00/)).toBeInTheDocument();
      await userEvent.click(within(form).getByRole('button', { name: 'Criar plantão' }));

      expect(await screen.findByText(/Plantão criado/)).toBeInTheDocument();
      expect(callsOn('shifts', 'insert')[0].payload).toEqual({
        household_id: 'house-1',
        care_recipient_id: 'rec-1',
        period: '[2030-01-15T11:00:00.000Z,2030-01-15T23:00:00.000Z)',
        rate_cents: 28000,
        caregiver_payout_cents: 28000,
        notes: 'Almoço já fica pronto',
      });
      const link = await screen.findByRole('link', { name: /Aberto, sem ofertas/ });
      expect(link).toHaveAttribute('href', '/cuidado/plantoes/shift-1');
      expect(link).toHaveTextContent('Cuidado de Lúcia');
      expect(link).toHaveTextContent('R$ 280,00');
    });

    it('makes a night shift end on the next day', async () => {
      renderCare('/cuidado/plantoes');
      const form = await screen.findByRole('form', { name: 'Novo plantão' });
      await userEvent.type(within(form).getByLabelText('Dia de início'), '2030-01-15');
      const start = within(form).getByLabelText('Início');
      const end = within(form).getByLabelText('Fim');
      await userEvent.clear(start);
      await userEvent.type(start, '19:00');
      await userEvent.clear(end);
      await userEvent.type(end, '07:00');
      expect(within(form).getByText(/19:00 às 07:00 do dia seguinte/)).toBeInTheDocument();
      await userEvent.type(within(form).getByLabelText(/Valor do plantão/), '350');
      await userEvent.click(within(form).getByRole('button', { name: 'Criar plantão' }));
      await screen.findByText(/Plantão criado/);
      expect(callsOn('shifts', 'insert')[0].payload).toMatchObject({
        period: '[2030-01-15T22:00:00.000Z,2030-01-16T10:00:00.000Z)',
        rate_cents: 35000,
      });
    });

    it.each([
      ['without a day', '', '280', /Informe o dia e os horários/],
      ['without a value', '2030-01-15', '', /Informe o valor do plantão em reais/],
      ['in the past', '2020-01-15', '280', /precisa começar no futuro/],
    ])('refuses a shift %s', async (_name, day, value, message) => {
      renderCare('/cuidado/plantoes');
      const form = await screen.findByRole('form', { name: 'Novo plantão' });
      if (day) fireInput(within(form).getByLabelText('Dia de início'), day);
      if (value) await userEvent.type(within(form).getByLabelText(/Valor do plantão/), value);
      await userEvent.click(within(form).getByRole('button', { name: 'Criar plantão' }));
      expect(await within(form).findByRole('alert')).toHaveTextContent(message);
      expect(callsOn('shifts', 'insert')).toHaveLength(0);
    });

    it('refuses health information in the notes of a shift', async () => {
      renderCare('/cuidado/plantoes');
      const form = await screen.findByRole('form', { name: 'Novo plantão' });
      await userEvent.type(within(form).getByLabelText('Dia de início'), '2030-01-15');
      await userEvent.type(within(form).getByLabelText(/Valor do plantão/), '280');
      await userEvent.type(within(form).getByLabelText(/Observações para o cuidador/), 'Dar o medicamento às 14h');
      await userEvent.click(within(form).getByRole('button', { name: 'Criar plantão' }));
      expect(await within(form).findByRole('alert')).toHaveTextContent(/informação de saúde/);
      expect(callsOn('shifts', 'insert')).toHaveLength(0);
    });

    it('lists shifts with their status, the assigned caregiver and a summary of the offers', async () => {
      world.profiles.push({ id: CAREGIVER_ID, full_name: 'Ana Cuidadora' });
      world.shifts = [
        shiftRow({ id: 'shift-a', status: 'offered' }),
        shiftRow({
          id: 'shift-b',
          status: 'assigned',
          provider_id: CAREGIVER_ID,
          period: pgRange(new Date('2030-01-16T11:00:00Z'), new Date('2030-01-16T23:00:00Z')),
        }),
        shiftRow({ id: 'shift-c', status: 'canceled', period: pgRange(new Date('2030-01-17T11:00:00Z'), new Date('2030-01-17T23:00:00Z')) }),
      ];
      world.offers = [
        { shift_id: 'shift-a', provider_id: 'cg-1', status: 'offered', created_at: '' },
        { shift_id: 'shift-a', provider_id: 'cg-2', status: 'declined', created_at: '' },
      ];
      renderCare('/cuidado/plantoes');
      const offered = await screen.findByRole('link', { name: /Oferecido a cuidadores/ });
      expect(offered).toHaveTextContent('2 ofertas: 1 aguardando resposta, 1 recusou');
      expect(offered).toHaveTextContent('ter., 15/01/2030, 08:00 às 20:00');
      expect(screen.getByRole('link', { name: /Cuidador confirmado/ })).toHaveTextContent('Cuidador: Ana Cuidadora');
      const past = screen.getByRole('region', { name: 'Anteriores e cancelados' });
      expect(within(past).getByText('Cancelado')).toBeInTheDocument();
    });

    it('explains the weekly limit and the direct hiring path to the family', async () => {
      renderCare('/cuidado/plantoes');
      const note = await screen.findByRole('note', { name: /Por que o limite de 2 dias por semana/ });
      expect(note).toHaveTextContent(/LC 150\/2015/);
      expect(note).toHaveTextContent(/contrate diretamente/);
      expect(note).toHaveTextContent(/fora do WorkEasy/);
    });

    it('asks for a house first when there is none', async () => {
      world.households = [];
      renderCare('/cuidado/plantoes');
      expect(await screen.findByText(/cadastre primeiro a casa/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Cadastrar casa' })).toHaveAttribute('href', '/cuidado');
    });
  });

  describe('/cuidado/plantoes/:id', () => {
    beforeEach(() => {
      world.households = [household()];
      world.recipients = [recipient()];
      world.shifts = [shiftRow()];
      world.caregivers = [
        {
          occupation: 'cuidador-de-idosos',
          provider_id: 'cg-1',
          display_name: 'Ana Cuidadora',
          slug: 'ana-cuidadora',
          bio: 'Dez anos de experiência',
          avatar_path: null,
          rating_avg: null,
          rating_count: null,
          price_min_cents: 28000,
          price_max_cents: 32000,
          unit: 'plantao',
          registry_status: 'informed',
        },
        {
          occupation: 'cuidador-de-idosos',
          provider_id: 'cg-2',
          display_name: 'Bia Acompanhante',
          slug: 'bia-acompanhante',
          bio: null,
          avatar_path: null,
          rating_avg: null,
          rating_count: null,
          price_min_cents: null,
          price_max_cents: null,
          unit: null,
          registry_status: 'confirmed',
        },
      ];
    });

    it('finds caregivers of a care occupation in the neighborhood of the house and offers the shift', async () => {
      renderCare('/cuidado/plantoes/shift-1');
      expect(await screen.findByText('Cuidado de Lúcia · Valor R$ 280,00')).toBeInTheDocument();
      expect(await screen.findByLabelText('Tipo de cuidador')).toHaveDisplayValue('Cuidador de idosos');
      expect(screen.getByLabelText('Bairro de atendimento')).toHaveDisplayValue('Lapa');

      const ana = await screen.findByRole('checkbox', { name: /Ana Cuidadora/ });
      expect(screen.getByText(/R\$ 280,00 a R\$ 320,00 por plantão/)).toBeInTheDocument();
      expect(screen.getByText('Registro profissional informado pelo cuidador')).toBeInTheDocument();
      expect(screen.getByText('Registro profissional confirmado pelo WorkEasy')).toBeInTheDocument();
      expect(fake.rpcCalls.find(call => call.name === 'search_providers')?.args).toMatchObject({
        p_occupation: 'cuidador-de-idosos',
        p_neighborhood: 'nb-lapa',
      });

      await userEvent.click(ana);
      await userEvent.click(screen.getByRole('button', { name: 'Oferecer a 1 cuidador' }));
      expect(await screen.findByText(/Oferta enviada. Agora há 1 oferta aguardando resposta/)).toBeInTheDocument();
      expect(isRpc(fake, 'offer_shift')[0].args).toEqual({ p_shift: 'shift-1', p_providers: ['cg-1'] });
      expect(await screen.findByText('1 oferta: 1 aguardando resposta')).toBeInTheDocument();
      expect(screen.getByText('Oferecido a cuidadores')).toBeInTheDocument();
      // The caregiver who already has the offer cannot be chosen again
      expect(await screen.findByText('Já recebeu a oferta deste plantão')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /Ana Cuidadora/ })).toBeDisabled();
    });

    it('offers to several caregivers at once', async () => {
      renderCare('/cuidado/plantoes/shift-1');
      await userEvent.click(await screen.findByRole('checkbox', { name: /Ana Cuidadora/ }));
      await userEvent.click(screen.getByRole('checkbox', { name: /Bia Acompanhante/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Oferecer a 2 cuidadores' }));
      await screen.findByText(/Oferta enviada/);
      expect(isRpc(fake, 'offer_shift')[0].args?.p_providers).toEqual(['cg-1', 'cg-2']);
    });

    it('does not let the family pick more than the limit of 10 offers per shift', async () => {
      world.caregivers = Array.from({ length: 12 }, (_, i) => ({
        occupation: 'cuidador-de-idosos',
        provider_id: `cg-${i + 1}`,
        display_name: `Cuidador ${i + 1}`,
        slug: `cuidador-${i + 1}`,
        bio: null,
        price_min_cents: null,
        price_max_cents: null,
        unit: null,
        registry_status: null,
      }));
      renderCare('/cuidado/plantoes/shift-1');
      const boxes = await screen.findAllByRole('checkbox');
      for (const box of boxes.slice(0, 10)) await userEvent.click(box);
      expect(boxes[10]).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Oferecer a 10 cuidadores' })).toBeEnabled();
    });

    it('says when the database refuses the offers: too many offers', async () => {
      world.rpcErrors.offer_shift = 'offer_limit';
      renderCare('/cuidado/plantoes/shift-1');
      await userEvent.click(await screen.findByRole('checkbox', { name: /Ana Cuidadora/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Oferecer a 1 cuidador' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/Limite de ofertas atingido: no máximo 10 cuidadores por plantão e 30 ofertas novas por dia/);
    });

    it('explains the labor lock, with the direct hiring path, if the database ever refuses an offer for it', async () => {
      world.rpcErrors.offer_shift = 'labor_lock';
      renderCare('/cuidado/plantoes/shift-1');
      await userEvent.click(await screen.findByRole('checkbox', { name: /Ana Cuidadora/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Oferecer a 1 cuidador' }));
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Limite de 2 dias por semana com o mesmo cuidador');
      expect(alert).toHaveTextContent(/com o mesmo cuidador nesta casa/);
      expect(alert).toHaveTextContent(/contrate diretamente/);
    });

    it('says when nobody serves the neighborhood', async () => {
      world.caregivers = [];
      renderCare('/cuidado/plantoes/shift-1');
      expect(await screen.findByText(/Nenhum cuidador aprovado atende este bairro agora/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Escolha ao menos um cuidador' })).toBeDisabled();
    });

    it('cancels the shift after confirming, with the reason', async () => {
      world.shifts = [shiftRow({ status: 'offered' })];
      world.offers = [{ shift_id: 'shift-1', provider_id: 'cg-1', status: 'offered', created_at: '' }];
      renderCare('/cuidado/plantoes/shift-1');
      await userEvent.type(await screen.findByLabelText('Motivo (opcional)'), 'Não precisa mais');
      await userEvent.click(screen.getByRole('button', { name: 'Cancelar plantão' }));
      expect(isRpc(fake, 'cancel_shift')).toHaveLength(0);
      await userEvent.click(screen.getByRole('button', { name: 'Sim, cancelar plantão' }));
      expect(await screen.findByText('Cancelado')).toBeInTheDocument();
      expect(isRpc(fake, 'cancel_shift')[0].args).toEqual({ p_shift: 'shift-1', p_reason: 'Não precisa mais' });
      expect(screen.queryByRole('heading', { name: 'Oferecer a cuidadores' })).not.toBeInTheDocument();
      expect(world.offers[0].status).toBe('expired');
    });

    it('shows the assigned caregiver, the check-ins with location and the daily report', async () => {
      world.profiles.push({ id: CAREGIVER_ID, full_name: 'Ana Cuidadora' });
      world.shifts = [shiftRow({ status: 'completed', provider_id: CAREGIVER_ID })];
      world.checkins = [
        { id: 'ck-1', shift_id: 'shift-1', provider_id: CAREGIVER_ID, kind: 'in', at: '2030-01-15T11:03:00Z', lat: '-23.561345', lng: '-46.656571' },
        { id: 'ck-2', shift_id: 'shift-1', provider_id: CAREGIVER_ID, kind: 'out', at: '2030-01-15T23:01:00Z', lat: null, lng: null },
      ];
      world.reports = [
        { id: 'r-1', shift_id: 'shift-1', provider_id: CAREGIVER_ID, meals: 'Almoço e lanche', activities: 'Caminhada', mood: 'Animada', notes: null, created_at: '' },
      ];
      renderCare('/cuidado/plantoes/shift-1');
      expect(await screen.findByText('Ana Cuidadora')).toBeInTheDocument();
      expect(screen.getByText('Concluído')).toBeInTheDocument();
      const records = screen.getByRole('region', { name: 'Entrada, saída e relatório' });
      expect(within(records).getByText(/ter\., 15\/01\/2030, 08:03/)).toBeInTheDocument();
      expect(within(records).getByRole('link', { name: /Ver local do registro/ })).toHaveAttribute(
        'href',
        'https://www.openstreetmap.org/?mlat=-23.561345&mlon=-46.656571#map=17/-23.561345/-46.656571',
      );
      expect(within(records).getByText('sem localização')).toBeInTheDocument();
      expect(within(records).getByText('Almoço e lanche')).toBeInTheDocument();
      expect(within(records).getByText('Animada')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cancelar plantão' })).not.toBeInTheDocument();
    });

    it('shows the name the caregiver gives clients (display name), not the name of the account', async () => {
      world.profiles.push({ id: CAREGIVER_ID, full_name: 'Ana Maria da Silva Souza' });
      world.providerRows = [{ id: CAREGIVER_ID, display_name: 'Ana Cuidadora' }];
      world.shifts = [shiftRow({ status: 'assigned', provider_id: CAREGIVER_ID })];
      renderCare('/cuidado/plantoes/shift-1');
      expect(await screen.findByText('Ana Cuidadora')).toBeInTheDocument();
      expect(screen.queryByText(/Ana Maria da Silva Souza/)).not.toBeInTheDocument();
    });

    it('falls back to the account name for a caregiver without a display name', async () => {
      world.profiles.push({ id: CAREGIVER_ID, full_name: 'Ana Maria' });
      world.providerRows = [{ id: CAREGIVER_ID, display_name: '  ' }];
      world.shifts = [shiftRow({ status: 'assigned', provider_id: CAREGIVER_ID })];
      renderCare('/cuidado/plantoes/shift-1');
      expect(await screen.findByText('Ana Maria')).toBeInTheDocument();
    });

    it('lists the care occupations by the name in the database when the catalog of the app does not know them', async () => {
      world.policies = [
        { occupation_slug: 'cuidador-de-idosos', price_units: ['plantao'] },
        { occupation_slug: 'tecnico-de-enfermagem', price_units: ['plantao'] },
        { occupation_slug: 'sem-nome-em-lugar-nenhum', price_units: ['plantao'] },
      ];
      world.occupations = [{ slug: 'tecnico-de-enfermagem', name: 'Técnico de enfermagem' }];
      renderCare('/cuidado/plantoes/shift-1');
      const select = await screen.findByLabelText('Tipo de cuidador');
      const options = within(select).getAllByRole('option').map(option => option.textContent);
      expect(options).toContain('Cuidador de idosos');
      expect(options).toContain('Técnico de enfermagem');
      // Last resort: the slug itself
      expect(options).toContain('sem-nome-em-lugar-nenhum');
    });

    it('says the shift is not found when the address is not an identifier at all', async () => {
      world.tableErrors.shifts = { code: '22P02', message: 'invalid input syntax for type uuid: "abc"' };
      renderCare('/cuidado/plantoes/abc');
      expect(await screen.findByText('Não encontramos este plantão.')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('says when the shift is not found', async () => {
      renderCare('/cuidado/plantoes/outro');
      expect(await screen.findByText('Não encontramos este plantão.')).toBeInTheDocument();
    });
  });

  describe('/cuidado/relatorios', () => {
    it('reads the reports and check-ins of started shifts, newest first', async () => {
      world.households = [household()];
      world.recipients = [recipient()];
      world.profiles.push({ id: CAREGIVER_ID, full_name: 'Ana Cuidadora' });
      world.shifts = [
        shiftRow({ id: 'shift-1', status: 'completed', provider_id: CAREGIVER_ID }),
        shiftRow({
          id: 'shift-2',
          status: 'checked_in',
          provider_id: CAREGIVER_ID,
          period: pgRange(new Date('2030-01-16T11:00:00Z'), new Date('2030-01-16T23:00:00Z')),
        }),
        shiftRow({ id: 'shift-3', status: 'open', period: pgRange(new Date('2030-01-17T11:00:00Z'), new Date('2030-01-17T23:00:00Z')) }),
      ];
      world.checkins = [{ id: 'ck-1', shift_id: 'shift-1', provider_id: CAREGIVER_ID, kind: 'in', at: '2030-01-15T11:03:00Z', lat: null, lng: null }];
      world.reports = [{ id: 'r-1', shift_id: 'shift-1', provider_id: CAREGIVER_ID, meals: 'Sopa no jantar', activities: null, mood: null, notes: null, created_at: '' }];
      renderCare('/cuidado/relatorios');
      await screen.findAllByText(/Cuidado de Lúcia/);
      const cards = screen.getAllByRole('listitem').filter(item => item.textContent?.includes('Cuidado de Lúcia'));
      expect(cards).toHaveLength(2);
      expect(cards[0]).toHaveTextContent('qua., 16/01/2030');
      expect(cards[0]).toHaveTextContent('O relatório deste dia ainda não foi enviado.');
      expect(cards[1]).toHaveTextContent('Sopa no jantar');
      expect(cards[1]).toHaveTextContent('Cuidador: Ana Cuidadora');
      expect(screen.getByText(/não informação de saúde nem laudo/)).toBeInTheDocument();
    });

    it('says what appears here when there is nothing yet', async () => {
      renderCare('/cuidado/relatorios');
      expect(await screen.findByText(/Ainda não há relatórios/)).toBeInTheDocument();
    });
  });
});

// <input type="date"> and user-event typing do not mix well with a value below `min`
function fireInput(element: HTMLElement, value: string) {
  const input = element as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
