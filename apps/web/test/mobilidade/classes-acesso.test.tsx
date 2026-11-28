import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DriverCapacityReview } from '../../components/mobility/DriverCapacityReview';
import { RideClassChoices } from '../../components/mobility/RideClassChoices';
import { AccessOptions } from '../../components/mobility/modes/AccessOptions';
import { getClassOptions } from '../../services/rideLocalMap';
import { rideMarket, type AccessMenu, type Assistance, type ClassFeatureOption } from '../../services/rideMarket';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ backendEnabled: true, supabase: { rpc } }));
vi.mock('../../services/rideLocalMap', () => ({ getClassOptions: vi.fn() }));
vi.mock('../../services/rideMarket', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/rideMarket')>();
  return {
    ...original,
    rideMarket: {
      ...original.rideMarket,
      classMenu: vi.fn(),
      accessOptions: vi.fn(),
      validateVehicleFeatures: vi.fn(),
      verifyAccessEquipment: vi.fn(),
    },
  };
});

const option = (code: string, label: string, extra: Partial<ClassFeatureOption> = {}): ClassFeatureOption => ({
  code,
  label,
  seats: 4,
  tools: false,
  accessible: false,
  fare_cents: 3200,
  approach_minutes: 6,
  duration_minutes: 18,
  available: true,
  observed_at: '2026-11-27T15:00:00Z',
  luggage: 2,
  standard: 'standard',
  electric: false,
  pets: false,
  priority_wait_minutes: null,
  ...extra,
});
const classes = [
  option('economico', 'Econômico'),
  option('eletrico', 'Elétrico', { fare_cents: 3900, standard: 'comfort', electric: true, pets: true, luggage: 1 }),
  option('prioridade', 'Prioridade', { fare_cents: 4500, standard: 'premium', priority_wait_minutes: 5 }),
  option('van', 'Van', { fare_cents: 5800, seats: 6, luggage: 4 }),
];
const onSelect = vi.fn();
function Chooser({ initial = '' }: { initial?: string }) {
  const [selected, setSelected] = useState(initial);
  return (
    <form>
      <RideClassChoices
        routeId="rota"
        departure={null}
        selected={selected}
        onSelect={(code) => {
          onSelect(code);
          setSelected(code);
        }}
      />
    </form>
  );
}
const choice = (name: RegExp) => screen.getByRole('radio', { name });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getClassOptions).mockResolvedValue(classes);
});

describe('classes de veículo por característica', () => {
  it('mostra lugares, malas, padrão, elétrico, animal doméstico, prioridade e preço de cada classe, com a regra do cão-guia', async () => {
    render(<Chooser />);
    const basic = await screen.findByRole('radio', { name: /Econômico/ });
    expect(basic.closest('label')).toHaveTextContent('Econômico · 4 lugares · 2 malas · padrão básico');
    expect(basic.closest('label')).toHaveTextContent(/R\$\s32,00 antes dos adicionais/);
    const electric = choice(/Elétrico/).closest('label');
    expect(electric).toHaveTextContent('1 mala · padrão conforto · veículo elétrico · aceita animal doméstico');
    expect(electric).toHaveTextContent(/R\$\s39,00/);
    const priority = choice(/Prioridade/).closest('label');
    expect(priority).toHaveTextContent('padrão premium · prioridade: só é ofertada com chegada estimada em até 5 min');
    expect(priority).toHaveTextContent(/R\$\s45,00/);
    expect(choice(/Van/).closest('label')).toHaveTextContent('Van · 6 lugares · 4 malas');
    expect(
      screen.getByText(
        'Cão-guia e animal de assistência viajam em qualquer classe, sem custo adicional e sem necessidade de declaração.',
      ),
    ).toBeVisible();
    expect(screen.getByText(/Estimativa consultada às 12:00\s+\(São Paulo\)/)).toBeVisible();
    expect(getClassOptions).toHaveBeenCalledWith('rota', null);
    expect(rideMarket.classMenu).not.toHaveBeenCalled();
    fireEvent.click(choice(/Van/));
    expect(onSelect).toHaveBeenCalledWith('van');
  });

  it('continua lendo a lista anterior do servidor, sem as chaves novas', async () => {
    vi.mocked(getClassOptions).mockResolvedValue([
      { code: 'padrao', label: 'Padrão', seats: 1, tools: true, accessible: true, fare_cents: 2000, approach_minutes: null, duration_minutes: null, available: false, observed_at: '2026-11-27T15:00:00Z' },
    ]);
    render(<Chooser />);
    const only = await screen.findByRole('radio', { name: /Padrão/ });
    expect(only).toBeDisabled();
    expect(only.closest('label')).toHaveTextContent(
      'Padrão · 1 lugar · espaço para equipamentos e bagagem · recursos de acessibilidade disponíveis',
    );
    expect(only.closest('label')).toHaveTextContent('sem motorista elegível nesta janela');
  });

  it('quando a bagagem não cabe, desfaz a escolha, mostra a alternativa do servidor e só troca com escolha explícita', async () => {
    vi.mocked(rideMarket.classMenu).mockResolvedValue({
      options: classes.map((c) => ({ ...c, fits: c.code === 'van' })),
      alternative: 'van',
    });
    render(<Chooser initial="economico" />);
    expect(await screen.findByRole('radio', { name: /Econômico/ })).toBeChecked();
    fireEvent.change(screen.getByLabelText('Malas'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conferir classes compatíveis' }));
    await waitFor(() =>
      expect(rideMarket.classMenu).toHaveBeenCalledWith('rota', null, {
        seats: 1,
        luggage: 4,
        pets: false,
        electric: false,
        priority: false,
      }),
    );
    const notice = await screen.findByText(/O que você informou não cabe em Econômico, Elétrico, Prioridade/);
    expect(notice).toHaveTextContent(/Alternativa indicada: Van · 6 lugares · 4 malas.*por R\$\s58,00 antes dos adicionais/);
    expect(onSelect).toHaveBeenCalledWith('');
    expect(choice(/Econômico/)).toBeDisabled();
    expect(choice(/Econômico/).closest('label')).toHaveTextContent('não comporta o que você informou');
    // Nothing is chosen for the passenger: every class is unchecked until the explicit choice.
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked();
    expect(screen.getByText('Nada é trocado sem a sua escolha. Você também pode ajustar o que informou.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Escolher Van por R\$\s58,00/ }));
    expect(onSelect).toHaveBeenLastCalledWith('van');
    expect(choice(/Van/)).toBeChecked();
    expect(screen.getByText('Você escolheu Van. A cotação usará esta classe e este preço.')).toBeVisible();
  });

  it('sem classe que comporte o pedido, não sugere nada e não deixa escolher', async () => {
    vi.mocked(rideMarket.classMenu).mockResolvedValue({
      options: classes.map((c) => ({ ...c, fits: false })),
      alternative: null,
    });
    render(<Chooser />);
    fireEvent.change(await screen.findByLabelText('Passageiros'), { target: { value: '9' } });
    fireEvent.click(screen.getByLabelText('Levo animal doméstico'));
    fireEvent.click(screen.getByLabelText('Prefiro veículo elétrico'));
    fireEvent.click(screen.getByLabelText('Quero prioridade na chegada do motorista'));
    fireEvent.click(screen.getByRole('button', { name: 'Conferir classes compatíveis' }));
    expect(await screen.findByText(/Nenhuma classe comporta o que você informou nesta janela/)).toBeVisible();
    expect(rideMarket.classMenu).toHaveBeenCalledWith('rota', null, {
      seats: 9,
      luggage: 0,
      pets: true,
      electric: true,
      priority: true,
    });
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Escolher/ })).toBeNull();
  });

  it('não tem campo para declarar cão-guia ou animal de assistência, e o que vai ao servidor não tem essa chave', async () => {
    vi.mocked(rideMarket.classMenu).mockResolvedValue({ options: classes.map((c) => ({ ...c, fits: true })), alternative: null });
    render(<Chooser />);
    await screen.findByRole('radio', { name: /Econômico/ });
    expect(screen.queryByLabelText(/guia|assist/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Conferir classes compatíveis' }));
    await waitFor(() => expect(rideMarket.classMenu).toHaveBeenCalled());
    expect(Object.keys(vi.mocked(rideMarket.classMenu).mock.calls[0][2]).sort()).toEqual([
      'electric',
      'luggage',
      'pets',
      'priority',
      'seats',
    ]);
  });
});

const menu = (extra: Partial<AccessMenu> = {}): AccessMenu => ({
  options: [
    { assistance: 'boarding', available: true, boarding_minutes: 3, companion: true },
    { assistance: 'folding_equipment', available: true, boarding_minutes: 5, companion: true },
    { assistance: 'wheelchair_vehicle', available: true, boarding_minutes: 10, companion: true },
  ],
  channel: '+55 11 4000-0000',
  ...extra,
});
const onChange = vi.fn();
function Access({ refused = false, initial = 'none' }: { refused?: boolean; initial?: 'none' | Assistance }) {
  const [state, setState] = useState<{ value: 'none' | Assistance; companion: boolean }>({ value: initial, companion: false });
  return (
    <AccessOptions
      routeId="rota"
      departure="2090-06-11T12:30:00.000Z"
      value={state.value}
      companion={state.companion}
      refused={refused}
      onChange={(value, companion) => {
        onChange(value, companion);
        setState({ value, companion });
      }}
    />
  );
}

describe('assistência e veículo acessível', () => {
  it('oferece cada assistência com o tempo de embarque e o assento de acompanhante, sem pedir diagnóstico', async () => {
    vi.mocked(rideMarket.accessOptions).mockResolvedValue(menu());
    render(<Access />);
    const group = await screen.findByRole('group', { name: 'Assistência no embarque' });
    expect(rideMarket.accessOptions).toHaveBeenCalledWith('rota', '2090-06-11T12:30:00.000Z');
    expect(group).toHaveTextContent('Ninguém pede diagnóstico, laudo ou motivo');
    expect(within(group).queryByRole('textbox')).toBeNull();
    expect(within(group).queryByRole('combobox')).toBeNull();
    expect(screen.queryByLabelText(/diagn|defici|laudo|doen/i)).toBeNull();
    expect(screen.getByRole('radio', { name: /Sem assistência especial/ })).toBeChecked();
    expect(screen.queryByLabelText(/acompanhante/)).toBeNull();
    const adapted = screen.getByRole('radio', { name: /Veículo adaptado para viajar na cadeira/ });
    expect(adapted.closest('label')).toHaveTextContent('10 min a mais para o embarque, sem adicional');
    fireEvent.click(adapted);
    expect(onChange).toHaveBeenLastCalledWith('wheelchair_vehicle', false);
    fireEvent.click(screen.getByLabelText(/Vou com acompanhante/));
    expect(onChange).toHaveBeenLastCalledWith('wheelchair_vehicle', true);
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /Sem assistência especial/ }));
    expect(onChange).toHaveBeenLastCalledWith('none', false);
  });

  it('sem veículo compatível, diz isso, aponta o plantão e não deixa escolher nem promete transporte', async () => {
    vi.mocked(rideMarket.accessOptions).mockResolvedValue(
      menu({ options: menu().options.map((o) => ({ ...o, available: false, companion: false })) }),
    );
    render(<Access />);
    const notice = await screen.findByText(/Não há veículo compatível para este trajeto e horário\./);
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).toHaveTextContent('Nenhuma cotação com assistência é criada sem veículo e motorista conferidos pela operação.');
    expect(within(notice).getByRole('link', { name: '+55 11 4000-0000' })).toHaveAttribute('href', 'tel:+551140000000');
    for (const name of [/Ajuda para embarcar/, /Equipamento portátil/, /Veículo adaptado/]) {
      const radio = screen.getByRole('radio', { name });
      expect(radio).toBeDisabled();
      expect(radio.closest('label')).toHaveTextContent('Sem veículo e motorista compatíveis nesta janela');
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it('veículo adaptado indisponível não bloqueia as outras assistências, e a falta de assento de acompanhante é dita', async () => {
    vi.mocked(rideMarket.accessOptions).mockResolvedValue(
      menu({
        options: [
          { assistance: 'boarding', available: true, boarding_minutes: 0, companion: false },
          { assistance: 'wheelchair_vehicle', available: false, boarding_minutes: 10, companion: false },
        ],
        channel: null,
      }),
    );
    render(<Access initial="wheelchair_vehicle" />);
    const notice = await screen.findByText(/A assistência escolhida está sem veículo compatível para este trajeto e horário\./);
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).toHaveTextContent('O canal do plantão ainda não foi publicado para esta área.');
    const boarding = screen.getByRole('radio', { name: /Ajuda para embarcar/ });
    expect(boarding.closest('label')).toHaveTextContent('Disponível nesta janela, sem adicional');
    fireEvent.click(boarding);
    expect(onChange).toHaveBeenLastCalledWith('boarding', false);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('Assento para acompanhante indisponível nesta janela.')).toBeVisible();
    expect(screen.queryByLabelText(/acompanhante/)).toBeNull();
  });

  it('quando o servidor recusa a cotação por falta de veículo, o formulário mostra o plantão em vez de uma promessa', async () => {
    vi.mocked(rideMarket.accessOptions).mockResolvedValue(menu({ channel: 'plantao@workeasy.invalid' }));
    render(<Access refused initial="wheelchair_vehicle" />);
    const notice = await screen.findByText(/Não há veículo compatível para este trajeto e horário\./);
    expect(notice).toHaveTextContent('Nenhuma cotação com assistência é criada');
    expect(within(notice).getByRole('link')).toHaveAttribute('href', 'mailto:plantao@workeasy.invalid');
  });

  it('a falha da consulta aparece como erro, com nova tentativa, e nenhuma opção é oferecida', async () => {
    vi.mocked(rideMarket.accessOptions).mockRejectedValueOnce(new Error('rede')).mockResolvedValue(menu());
    render(<Access />);
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByRole('radio')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar assistência de novo' }));
    expect(await screen.findByRole('radio', { name: /Ajuda para embarcar/ })).toBeEnabled();
  });
});

function review() {
  render(<DriverCapacityReview driverId="motorista" />);
  // The review sits in a closed disclosure; the operator opens it first.
  (screen.getByText('Verificar lugares, equipamentos e acessibilidade').closest('details') as HTMLDetailsElement).open = true;
}
describe('revisão de capacidade pela operação', () => {
  it('registra bagagem, padrão, propulsão e animal doméstico do veículo aprovado', async () => {
    vi.mocked(rideMarket.validateVehicleFeatures).mockResolvedValue(undefined);
    review();
    fireEvent.change(screen.getByLabelText('Malas que cabem no bagageiro'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Padrão do veículo'), { target: { value: 'comfort' } });
    fireEvent.change(screen.getByLabelText('Propulsão'), { target: { value: 'electric' } });
    fireEvent.click(screen.getByLabelText('Preparado para animal doméstico'));
    fireEvent.change(screen.getByLabelText('Referência da vistoria das características'), { target: { value: 'vistoria-88' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar características' }));
    expect(await screen.findByText('Características registradas para o veículo aprovado.')).toHaveAttribute('role', 'status');
    expect(rideMarket.validateVehicleFeatures).toHaveBeenCalledWith('motorista', {
      luggage: 3,
      standard: 'comfort',
      propulsion: 'electric',
      pets: true,
      reference: 'vistoria-88',
    });
    expect(screen.queryByLabelText(/guia|assistência/i)).toBeNull();
    expect(screen.getByText(/Cão-guia e animal de assistência viajam em qualquer veículo/)).toBeVisible();
  });

  it('registra cada equipamento de acessibilidade com inspeção, capacitação e validade no fim do dia de São Paulo', async () => {
    vi.mocked(rideMarket.verifyAccessEquipment).mockRejectedValueOnce({ code: 'P0001', message: 'not_allowed' }).mockResolvedValue(undefined);
    review();
    expect(within(screen.getByLabelText('Equipamento')).getAllByRole('option').map((o) => (o as HTMLOptionElement).value)).toEqual([
      'ramp',
      'lift',
      'restraint',
      'companion_seat',
    ]);
    fireEvent.change(screen.getByLabelText('Equipamento'), { target: { value: 'lift' } });
    fireEvent.change(screen.getByLabelText('Referência da inspeção do equipamento'), { target: { value: 'insp-12' } });
    fireEvent.change(screen.getByLabelText('Referência da capacitação do motorista'), { target: { value: 'curso-7' } });
    fireEvent.change(screen.getByLabelText('Equipamento válido até (São Paulo)'), { target: { value: '2099-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar equipamento' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByText(/Equipamento registrado/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar equipamento' }));
    expect(await screen.findByText('Equipamento registrado. Ele vale até a data informada.')).toBeVisible();
    expect(rideMarket.verifyAccessEquipment).toHaveBeenLastCalledWith('motorista', 'lift', 'insp-12', 'curso-7', '2100-01-01T02:59:00.000Z');
  });

  it('mantém o registro de lugares que já existia', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    review();
    fireEvent.change(screen.getByLabelText('Lugares para passageiros'), { target: { value: '4' } });
    fireEvent.click(screen.getByLabelText('Espaço para equipamentos e bagagem conferido'));
    fireEvent.change(screen.getByLabelText('Válido até'), { target: { value: '2099-12-31' } });
    fireEvent.change(screen.getByLabelText('Referência da inspeção'), { target: { value: 'insp-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar capacidade' }));
    expect(await screen.findByText('Capacidade validada para o veículo aprovado.')).toBeVisible();
    expect(rpc).toHaveBeenCalledWith('ride_validate_capacity', {
      p_driver: 'motorista',
      p_seats: 4,
      p_tools: true,
      p_accessible: false,
      p_until: '2100-01-01T02:59:00.000Z',
      p_reference: 'insp-1',
    });
  });
});

describe('chamadas do serviço de mercado', () => {
  it('usa os nomes e argumentos das funções do servidor', async () => {
    const real = (await vi.importActual<typeof import('../../services/rideMarket')>('../../services/rideMarket')).rideMarket;
    rpc.mockResolvedValue({ data: {}, error: null });
    await real.catalog('Saúde', null, null);
    expect(rpc).toHaveBeenLastCalledWith('ride_market_catalog', { p_origin: 'Saúde', p_destination: null, p_at: null });
    await real.request('hourly', 'Saúde', 'Jabaquara', null);
    expect(rpc).toHaveBeenLastCalledWith('ride_request_modality', { p_modality: 'hourly', p_origin: 'Saúde', p_destination: 'Jabaquara', p_at: null });
    const needs = { seats: 2, luggage: 1, pets: false, electric: false, priority: true };
    await real.classMenu('rota', null, needs);
    expect(rpc).toHaveBeenLastCalledWith('ride_class_menu', { p_route: 'rota', p_departure: null, p_needs: needs });
    await real.accessOptions('rota', '2090-06-11T12:30:00.000Z');
    expect(rpc).toHaveBeenLastCalledWith('ride_access_options', { p_route: 'rota', p_departure: '2090-06-11T12:30:00.000Z' });
    const legs = [{ origin: 'Saúde', destination: 'Jabaquara', payer: 'passenger' as const, route_id: 'rota' }];
    await real.quoteAccessible('chave', null, null, legs, 'wheelchair_vehicle', true);
    expect(rpc).toHaveBeenLastCalledWith('ride_quote_accessible', {
      p_key: 'chave',
      p_booking: null,
      p_scheduled_at: null,
      p_legs: legs,
      p_assistance: 'wheelchair_vehicle',
      p_companion: true,
    });
    rpc.mockResolvedValue({ data: null, error: null });
    await real.validateVehicleFeatures('motorista', { luggage: 2, standard: 'premium', propulsion: 'hybrid', pets: false, reference: 'ref-1' });
    expect(rpc).toHaveBeenLastCalledWith('ride_validate_vehicle_features', {
      p_driver: 'motorista',
      p_luggage: 2,
      p_standard: 'premium',
      p_propulsion: 'hybrid',
      p_pets: false,
      p_reference: 'ref-1',
    });
    await real.verifyAccessEquipment('motorista', 'ramp', 'insp-1', 'curso-1', '2100-01-01T02:59:00.000Z');
    expect(rpc).toHaveBeenLastCalledWith('ride_verify_access_equipment', {
      p_driver: 'motorista',
      p_kind: 'ramp',
      p_inspected: 'insp-1',
      p_trained: 'curso-1',
      p_until: '2100-01-01T02:59:00.000Z',
    });
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'ride_assistance_unavailable' } });
    const refusal = await real.quoteAccessible('chave', null, null, legs, 'wheelchair_vehicle', false).catch((err: unknown) => err);
    const { isRideRefusal } = await vi.importActual<typeof import('../../services/rideMarket')>('../../services/rideMarket');
    expect(isRideRefusal(refusal, 'ride_assistance_unavailable')).toBe(true);
    expect(isRideRefusal(refusal, 'ride_modality_unavailable')).toBe(false);
  });
});
