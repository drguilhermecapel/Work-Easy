import { useState } from 'react';
import { db } from '../../services/client';
import { saoPauloDateTime } from '../../lib/timezone';

export function DriverCapacityReview({ driverId }: { driverId: string }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <details className="mt-2 rounded border p-2">
      <summary>Verificar lugares, equipamentos e acessibilidade</summary>
      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const data = new FormData(e.currentTarget);
          const until = saoPauloDateTime(String(data.get('until')), '23:59');
          if (!until) return;
          setBusy(true);
          try {
            const { error } = await db().rpc('ride_validate_capacity', {
              p_driver: driverId,
              p_seats: Number(data.get('seats')),
              p_tools: data.has('tools'),
              p_accessible: data.has('accessible'),
              p_until: until.toISOString(),
              p_reference: String(data.get('reference')),
            });
            setMessage(
              error
                ? 'A verificação foi recusada. Confira o veículo, a validade e a referência.'
                : 'Capacidade validada para o veículo aprovado.',
            );
          } catch {
            setMessage('Não foi possível registrar a verificação.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block">
          Lugares para passageiros <input type="number" name="seats" required min="1" max="12" />
        </label>
        <label className="block">
          <input type="checkbox" name="tools" /> Espaço para equipamentos e bagagem conferido
        </label>
        <label className="block">
          <input type="checkbox" name="accessible" /> Recurso de acessibilidade da classe conferido
        </label>
        <label className="block">
          Válido até <input type="date" name="until" required />
        </label>
        <label className="block">
          Referência da inspeção <input name="reference" pattern="[A-Za-z0-9_./:\-]{3,100}" required />
        </label>
        <button disabled={busy} className="rounded border px-3 py-2">
          Registrar capacidade
        </button>
        {message && <p role="status">{message}</p>}
      </form>
    </details>
  );
}
