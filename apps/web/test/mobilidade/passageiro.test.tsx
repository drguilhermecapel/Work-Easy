import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuoteForm from '../../pages/mobilidade/QuoteForm';
import Ensaio from '../../pages/mobilidade/Ensaio';
import { quoteRide } from '../../services/rides';

vi.mock('../../services/rides', () => ({ quoteRide: vi.fn() }));
const areas = ['Saúde', 'Jabaquara', 'Vila Mariana'];

describe('cotação de mobilidade', () => {
  it('permite recusar o ensaio local sem acionar o backend', () => {
    render(<Ensaio />);
    fireEvent.click(screen.getByLabelText('Incluir retorno ao ponto A'));
    fireEvent.click(screen.getByRole('button', { name: 'Ver cotação fictícia' }));
    expect(screen.getByText(/Cliente pagaria/)).toHaveTextContent(/55,00/);
    fireEvent.click(screen.getByRole('button', { name: 'Ensaiar recusa' }));
    expect(screen.getByRole('status')).toHaveTextContent(/Transporte recusado/);
    expect(quoteRide).not.toHaveBeenCalled();
  });

  it('envia uma corrida imediata pública sem horários nem preço enviados pelo dispositivo', async () => {
    const onQuoted = vi.fn();
    vi.mocked(quoteRide).mockResolvedValue({ id: 'cot', expires_at: '', legs: [], total_cents: 1924 });
    render(<QuoteForm areas={areas} bookingId={null} onQuoted={onQuoted} />);
    fireEvent.change(screen.getByLabelText('Ponto de origem'), { target: { value: 'Saúde' } });
    fireEvent.change(screen.getByLabelText('Ponto de destino'), { target: { value: 'Jabaquara' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar preço' }));
    await waitFor(() => expect(onQuoted).toHaveBeenCalledWith('cot'));
    expect(quoteRide).toHaveBeenCalledWith(expect.any(String), null, null, [{ origin: 'Saúde', destination: 'Jabaquara', payer: 'passenger' }]);
  });

  it('mantém a chave na falha de rede e envia ida e volta agendadas com pagadores distintos', async () => {
    const onQuoted = vi.fn();
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2090-06-10T00:00:00Z').getTime());
    vi.mocked(quoteRide).mockClear();
    vi.mocked(quoteRide).mockRejectedValueOnce(new Error('network')).mockResolvedValue({ id: 'cot', expires_at: '', legs: [], total_cents: 4000 });
    render(<QuoteForm areas={areas} bookingId="atendimento" onQuoted={onQuoted} />);
    fireEvent.change(screen.getByLabelText('Ponto de origem'), { target: { value: 'Saúde' } });
    fireEvent.change(screen.getByLabelText('Ponto de destino'), { target: { value: 'Jabaquara' } });
    fireEvent.change(screen.getByLabelText(/Data e hora da ida/), { target: { value: '2090-06-11T09:30' } });
    fireEvent.click(screen.getByLabelText('Incluir retorno ou continuação'));
    fireEvent.change(screen.getByLabelText(/Data e hora do próximo/), { target: { value: '2090-06-11T14:00' } });
    fireEvent.change(screen.getByLabelText(/Quem paga o próximo/), { target: { value: 'provider' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar preço' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar preço' }));
    await waitFor(() => expect(onQuoted).toHaveBeenCalledWith('cot'));
    const [first, second] = vi.mocked(quoteRide).mock.calls;
    expect(second).toEqual(first);
    expect(second[1]).toBe('atendimento');
    expect(second[2]).toBe('2090-06-11T12:30:00.000Z');
    expect(second[3]).toEqual([
      { origin: 'Saúde', destination: 'Jabaquara', payer: 'client', pickup_at: second[2] },
      { origin: 'Jabaquara', destination: 'Saúde', payer: 'provider', pickup_at: '2090-06-11T17:00:00.000Z' },
    ]);
  });
  it('envia o vínculo privado ao próximo atendimento, a medição e somente os códigos de adicionais', async () => {
    const onQuoted = vi.fn();
    vi.mocked(quoteRide).mockClear();
    vi.mocked(quoteRide).mockResolvedValue({ id: 'cot', expires_at: '', legs: [], total_cents: 4000 });
    render(<QuoteForm areas={areas} bookingId="origem" requiresRoute nextBookings={[{ id: 'seguinte', label: 'Amanhã · montagem' }]}
      routes={[{ id: 'medida', origin_area: 'Saúde', destination_area: 'Jabaquara', service_endpoint: 'origin' }]}
      extras={[{ code: 'luggage', label: 'Bagagem adicional', cents: 400 }]} onQuoted={onQuoted} />);
    fireEvent.change(screen.getByLabelText('Saída'), { target: { value: 'now' } });
    fireEvent.change(screen.getByLabelText('Medição para a ida'), { target: { value: 'medida' } });
    fireEvent.change(screen.getByLabelText(/Atendimento seguinte do profissional/), { target: { value: 'seguinte' } });
    fireEvent.click(screen.getByLabelText(/Bagagem adicional/));
    fireEvent.click(screen.getByRole('button', { name: 'Consultar preço' }));
    await waitFor(() => expect(onQuoted).toHaveBeenCalled());
    expect(quoteRide).toHaveBeenCalledWith(expect.any(String), 'origem', null, [{ origin: 'Saúde', destination: 'Jabaquara',
      payer: 'client', route_id: 'medida', next_booking_id: 'seguinte', extras: ['luggage'] }]);
  });
});
