import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import ErrorAlert from '../ErrorAlert';
import { AppError } from '../../lib/errors';
import { db } from '../../services/client';
import { rideMarket, type AccessEquipment, type Propulsion, type VehicleStandard } from '../../services/rideMarket';
import { saoPauloDateTime } from '../../lib/timezone';

const reference = '[A-Za-z0-9_./:\\-]{3,100}';
const field = 'ml-2 rounded-lg border border-gray-300 bg-white p-1.5';
const submit = 'rounded border px-3 py-2 disabled:opacity-50';
const equipment: Record<AccessEquipment, string> = {
  ramp: 'Rampa',
  lift: 'Plataforma elevatória',
  restraint: 'Fixação da cadeira e cinto',
  companion_seat: 'Assento para acompanhante',
};

/** One review form: a single submission at a time, the failure in words and the outcome in a status line. */
function ReviewForm({
  title,
  action,
  done,
  work,
  children,
}: {
  title: string;
  action: string;
  done: string;
  work: (data: FormData) => Promise<void>;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const sending = useRef(false);
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      await work(new FormData(e.currentTarget));
      setNotice(done);
    } catch (err) {
      setError(err);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <form className="space-y-2 border-t pt-2" onSubmit={send}>
      <h4 className="font-semibold">{title}</h4>
      {children}
      <button disabled={busy} className={submit}>
        {action}
      </button>
      <ErrorAlert error={error} />
      {notice && <p role="status">{notice}</p>}
    </form>
  );
}

function endOfDay(day: FormDataEntryValue | null) {
  const until = saoPauloDateTime(String(day), '23:59');
  if (!until) throw new AppError('invalid_input', { message: 'Informe a validade no calendário de São Paulo.' });
  return until.toISOString();
}

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
          Referência da inspeção <input name="reference" pattern={reference} required />
        </label>
        <button disabled={busy} className="rounded border px-3 py-2">
          Registrar capacidade
        </button>
        {message && <p role="status">{message}</p>}
      </form>

      <ReviewForm
        title="Características do veículo"
        action="Registrar características"
        done="Características registradas para o veículo aprovado."
        work={(data) =>
          rideMarket.validateVehicleFeatures(driverId, {
            luggage: Number(data.get('luggage')),
            standard: String(data.get('standard')) as VehicleStandard,
            propulsion: String(data.get('propulsion')) as Propulsion,
            pets: data.has('pets'),
            reference: String(data.get('feature-reference')),
          })
        }
      >
        <p className="text-sm">
          Vale para o veículo com capacidade já registrada. Registre só o que a vistoria conferiu.
        </p>
        <label className="block">
          Malas que cabem no bagageiro
          <input className={field} type="number" name="luggage" required min="0" max="12" defaultValue="0" />
        </label>
        <label className="block">
          Padrão do veículo
          <select className={field} name="standard" defaultValue="standard">
            <option value="standard">Básico</option>
            <option value="comfort">Conforto</option>
            <option value="premium">Premium</option>
          </select>
        </label>
        <label className="block">
          Propulsão
          <select className={field} name="propulsion" defaultValue="combustion">
            <option value="combustion">Combustão</option>
            <option value="hybrid">Híbrido</option>
            <option value="electric">Elétrico</option>
          </select>
        </label>
        <label className="block">
          <input type="checkbox" name="pets" /> Preparado para animal doméstico
        </label>
        <p className="text-sm">
          Esta opção vale só para classes vendidas para animal doméstico. Cão-guia e animal de assistência viajam em
          qualquer veículo, sem registro e sem adicional.
        </p>
        <label className="block">
          Referência da vistoria das características
          <input className={field} name="feature-reference" pattern={reference} required />
        </label>
      </ReviewForm>

      <ReviewForm
        title="Equipamento de acessibilidade"
        action="Registrar equipamento"
        done="Equipamento registrado. Ele vale até a data informada."
        work={(data) =>
          rideMarket.verifyAccessEquipment(
            driverId,
            String(data.get('kind')) as AccessEquipment,
            String(data.get('inspected')),
            String(data.get('trained')),
            endOfDay(data.get('equipment-until')),
          )
        }
      >
        <p className="text-sm">
          Um registro por equipamento. O veículo adaptado precisa de fixação e de rampa ou plataforma, todos dentro da
          validade até o fim do trecho.
        </p>
        <label className="block">
          Equipamento
          <select className={field} name="kind" defaultValue="ramp">
            {Object.entries(equipment).map(([kind, name]) => (
              <option key={kind} value={kind}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          Referência da inspeção do equipamento
          <input className={field} name="inspected" pattern={reference} required />
        </label>
        <label className="block">
          Referência da capacitação do motorista
          <input className={field} name="trained" pattern={reference} required />
        </label>
        <label className="block">
          Equipamento válido até (São Paulo)
          <input className={field} type="date" name="equipment-until" required />
        </label>
      </ReviewForm>
    </details>
  );
}
