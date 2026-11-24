import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { BellPlus } from 'lucide-react';
import ErrorAlert from '../ErrorAlert';
import { joinWaitlist } from '../../services/requests';

interface Option {
  value: string;
  name: string;
}

interface Props {
  /** Neighborhoods the pilot does not serve yet. */
  options: Option[];
  occupationSlug: string | null;
  /** Null when nobody is signed in: the list needs an account to know who to tell. */
  userId: string | null;
}

/**
 * Waiting list for the neighborhoods outside the pilot (platform_settings.pilot_neighborhoods).
 * It records the account, the neighborhood and the service wanted, so the owner sees where the
 * demand is before opening a district. Nothing is promised: no date and no notice by itself.
 */
const PilotWaitlist: React.FC<Props> = ({ options, occupationSlug, userId }) => {
  const [chosen, setChosen] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const join = async () => {
    const option = options.find(o => o.value === chosen);
    if (!option || !userId) return;
    setBusy(true);
    setError(null);
    try {
      await joinWaitlist({ userId, neighborhoodId: option.value, occupationSlug });
      setDone(option.name);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="bg-gray-50 border border-gray-100 rounded-xl p-3">
      <summary className="cursor-pointer text-sm font-medium text-primary">Meu bairro não está na lista</summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-gray-600">
          Estamos começando por alguns bairros. Diga qual é o seu e ele entra na nossa lista de espera. Ainda não há data para
          os outros bairros.
        </p>
        {done ? (
          <p role="status" className="text-sm text-green-700">
            Anotado: {done} está na sua lista de espera.
          </p>
        ) : userId ? (
          <>
            <div>
              <label htmlFor="pedido-espera" className="block text-sm font-medium text-gray-700 mb-1">
                Seu bairro
              </label>
              <select
                id="pedido-espera"
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm bg-white"
                value={chosen}
                onChange={e => setChosen(e.target.value)}
              >
                <option value="">Escolha o bairro</option>
                {options.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <ErrorAlert error={error} />
            <button
              type="button"
              onClick={join}
              disabled={!chosen || busy}
              className="inline-flex items-center gap-2 min-h-11 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl px-4 py-2.5 hover:bg-gray-50 disabled:opacity-50"
            >
              <BellPlus size={16} aria-hidden="true" /> {busy ? 'Anotando…' : 'Entrar na lista de espera'}
            </button>
          </>
        ) : (
          <Link to={`/entrar?next=${encodeURIComponent('/pedido')}`} className="text-sm text-primary underline">
            Entre na sua conta para entrar na lista de espera
          </Link>
        )}
      </div>
    </details>
  );
};

export default PilotWaitlist;
