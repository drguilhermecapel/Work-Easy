import { useEffect, useState } from 'react';
import { getPassengerUpdates, type PassengerUpdates } from '../../services/rideLocalMap';
const labels: Record<string, string> = {
  requested: 'Solicitação recebida',
  searching: 'Procurando motorista para o embarque',
  accepted: 'Motorista confirmado',
  arriving: 'Motorista a caminho',
  boarded: 'Embarque registrado',
  completed: 'Corrida concluída',
  reminder: 'Lembrete de embarque com motorista confirmado',
  cancelled: 'Trecho cancelado. Você pode consultar uma nova cotação.',
  unknown: 'O plantão está confirmando a situação do trecho.',
  no_supply:
    'O prazo para encontrar motorista acabou. Escolha outro horário ou combine outra forma de deslocamento.',
};
export function PassengerRideUpdates({ revision }: { revision: number }) {
  const [data, setData] = useState<PassengerUpdates | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void getPassengerUpdates().then(
      (v) => {
        if (active) {
          setData(v);
          setError('');
        }
      },
      () => {
        if (active) setError('Atualizações de embarque indisponíveis.');
      },
    );
    return () => {
      active = false;
    };
  }, [revision]);
  if (!data?.items.length && !data?.external_available && !error) return null;
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">Avisos de embarque</h2>
      {error && <p role="status">{error}</p>}
      {data?.external_available && (
        <label>
          <input
            type="checkbox"
            checked={data.forward}
            onChange={(e) => {
              void getPassengerUpdates(e.target.checked).then(setData, () =>
                setError('Não foi possível alterar o canal.'),
              );
            }}
          />{' '}
          Receber também no contato verificado da minha conta
        </label>
      )}
      <ul>
        {data?.items.map((n) => (
          <li key={n.leg_id + n.event}>
            Trecho {n.seq} · {labels[n.event] ?? n.event} ·{' '}
            {new Intl.DateTimeFormat('pt-BR', {
              dateStyle: 'short',
              timeStyle: 'short',
              timeZone: 'America/Sao_Paulo',
            }).format(new Date(n.created_at))}
            {['requested', 'searching'].includes(n.event) && (
              <p>
                Previsão para encerrar a procura se faltar motorista:{' '}
                {new Date(n.search_deadline).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Você
                pode combinar outra forma de deslocamento com o atendimento.
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
