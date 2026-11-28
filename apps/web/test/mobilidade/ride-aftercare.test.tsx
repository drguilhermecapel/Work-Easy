import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RideAftercare } from '../../components/mobility/RideAftercare';
import { getRideAftercare, openRideHelp, rateRide, type RideReceipt } from '../../services/rideAftercare';

vi.mock('../../services/rideAftercare', () => ({ getRideAftercare: vi.fn(), openRideHelp: vi.fn(), rateRide: vi.fn() }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const receipt: RideReceipt = {
  id: 'trecho-azul', role: 'passenger', simulation: true, issued_at: '2026-11-27T13:00:00Z',
  journey: { origin: 'Saúde', destination: 'Jabaquara', driver_name: 'Joana', driver_number: 'TESTE',
    vehicle_category: 'sedan', vehicle_model: 'Veículo de ensaio', vehicle_plate: 'TESTE',
    boarded_at: '2026-11-27T12:30:00Z', ended_at: '2026-11-27T13:00:00Z', meters: 870,
    quoted_meters: 900, quoted_minutes: 28, points: [[-23.6, -46.6], [-23.65, -46.65]] },
  money: { fare_cents: 3000, extras_cents: 200, reversed_cents: 100, final_cents: 2900, paid_cents: 2900,
    due_cents: 0, disputed_cents: 0, pending: false },
};

describe('pós-viagem', () => {
  it('mostra o mapa reservado, o pagamento confirmado e uma via imprimível só desse trecho', async () => {
    vi.mocked(getRideAftercare).mockResolvedValue({ can_rate: true, stars: null, document: receipt });
    const printable = document.implementation.createHTMLDocument('');
    const print = vi.fn();
    vi.spyOn(window, 'open').mockReturnValue({ document: printable, focus: vi.fn(), print } as unknown as Window);
    render(<RideAftercare legId="l1" completed />);
    fireEvent.click(screen.getByText('Consultar recibo e avaliação'));
    expect(await screen.findByRole('img', { name: /Mapa dos pontos/ })).toBeInTheDocument();
    expect(screen.getByText(/Simulação · sem valor fiscal/)).toBeInTheDocument();
    expect(screen.getByText('Pagamento confirmado líquido')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('4 estrelas')); fireEvent.click(screen.getByText('Salvar avaliação do trecho'));
    await screen.findByText('Avaliação registrada.');
    expect(rateRide).toHaveBeenCalledWith('l1', 4);
    fireEvent.click(screen.getByText('Imprimir este documento'));
    expect(print).toHaveBeenCalled();
    expect(printable.body.textContent).toContain('trecho-azul');
    expect(printable.body.textContent).not.toContain('Registrar pedido de ajuda');
  });
  it('exibe a via do pagador sem mapa e troca de trecho sem reutilizar dados do anterior', async () => {
    vi.mocked(getRideAftercare).mockResolvedValue({ can_rate: false, stars: null, document: { ...receipt, role: 'payer', journey: undefined } });
    const { rerender } = render(<RideAftercare legId="pago" completed />);
    fireEvent.click(screen.getByText('Consultar recibo e avaliação'));
    await screen.findByText('Demonstrativo financeiro do trecho');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText('Jabaquara', { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByText('Salvar avaliação do trecho')).not.toBeInTheDocument();
    rerender(<RideAftercare legId="outro" completed={false} />);
    expect(screen.queryByText('Demonstrativo financeiro do trecho')).not.toBeInTheDocument();
  });
  it('quem viaja por conta de outra pessoa recebe o trajeto sem nenhum valor', async () => {
    vi.mocked(getRideAftercare).mockResolvedValue({ can_rate: true, stars: null, document: { ...receipt, money: null, paid_by_other: true } });
    render(<RideAftercare legId="familia" completed />);
    fireEvent.click(screen.getByText('Consultar recibo e avaliação'));
    expect(await screen.findByText(/Outra pessoa paga este trecho/)).toBeInTheDocument();
    expect(screen.getByText('Recibo do trecho')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Mapa dos pontos/ })).toBeInTheDocument();
    expect(screen.queryByText('Pagamento confirmado líquido')).not.toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
    expect(screen.queryByText('Valores em conciliação.')).not.toBeInTheDocument();
    expect(screen.getByText('Salvar avaliação do trecho')).toBeInTheDocument();
  });
  it('permite pedir ajuda durante uma corrida e apresenta o protocolo retornado', async () => {
    vi.mocked(openRideHelp).mockResolvedValue('ABC-42');
    render(<RideAftercare legId="ativo" completed={false} />);
    expect(screen.queryByText('Consultar recibo e avaliação')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Pedir ajuda com o trecho'));
    fireEvent.change(screen.getByLabelText('Motivo da ajuda'), { target: { value: 'payment' } });
    fireEvent.click(screen.getByText('Registrar pedido de ajuda'));
    expect(await screen.findByText(/ABC-42/)).toBeInTheDocument();
    expect(openRideHelp).toHaveBeenCalledWith('ativo', 'payment');
  });
});
